import "server-only";

import { eq, sql } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { genres, movieGenres, movies } from "@/lib/db/schema";
import type { MovieSeedCatalog, MovieSeedMovie } from "@/lib/movie-catalog/movie-seed-input";

export type MovieSeedResult = {
  genreCount: number;
  insertedMovieCount: number;
  linkCount: number;
  updatedMovieCount: number;
};

type ExistingMovie = {
  id: number;
  releaseYear: number;
  seedKey: string | null;
  title: string;
};

function naturalMovieIdentity(title: string, releaseYear: number): string {
  return `${title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("uk-UA")}\u0000${releaseYear}`;
}

function normalizedGenreName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("uk-UA");
}

function assertNoMovieIdentityConflicts(catalog: MovieSeedCatalog, existingMovies: ReadonlyArray<ExistingMovie>): void {
  const moviesBySeedKey = new Map(existingMovies.filter(movie => movie.seedKey !== null).map(movie => [movie.seedKey as string, movie]));
  const moviesByNaturalIdentity = new Map<string, ExistingMovie[]>();

  for (const movie of existingMovies) {
    const identity = naturalMovieIdentity(movie.title, movie.releaseYear);
    const matches = moviesByNaturalIdentity.get(identity) ?? [];
    matches.push(movie);
    moviesByNaturalIdentity.set(identity, matches);
  }

  for (const movie of catalog.movies) {
    const bySeedKey = moviesBySeedKey.get(movie.seedKey);
    const conflictingMovie = moviesByNaturalIdentity
      .get(naturalMovieIdentity(movie.titleUk, movie.releaseYear))
      ?.find(candidate => candidate.id !== bySeedKey?.id);
    if (conflictingMovie) {
      const ownership = conflictingMovie.seedKey === null ? "an unmanaged movie" : `seed key "${conflictingMovie.seedKey}"`;
      throw new Error(`Seed key "${movie.seedKey}" conflicts with ${ownership} using "${movie.titleUk}" (${movie.releaseYear}).`);
    }
  }
}

function movieValues(movie: MovieSeedMovie): typeof movies.$inferInsert {
  return {
    seedKey: movie.seedKey,
    title: movie.titleUk,
    releaseYear: movie.releaseYear,
    runtimeMinutes: movie.runtimeMinutes,
    posterPath: movie.poster?.path ?? null,
    availableOnNetflix: movie.availableOnNetflix,
  };
}

export class DrizzleMovieSeedRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async seed(catalog: MovieSeedCatalog): Promise<MovieSeedResult> {
    const database = await this.getDatabase();
    return database.transaction(async transaction => {
      await transaction.execute(sql`select pg_advisory_xact_lock(795184217)`);

      const existingGenres = await transaction.select({ id: genres.id, name: genres.name }).from(genres);
      const genresByNormalizedName = new Map<string, Array<(typeof existingGenres)[number]>>();
      for (const genre of existingGenres) {
        const normalizedName = normalizedGenreName(genre.name);
        const matches = genresByNormalizedName.get(normalizedName) ?? [];
        matches.push(genre);
        genresByNormalizedName.set(normalizedName, matches);
      }

      const existingMovies = await transaction
        .select({ id: movies.id, seedKey: movies.seedKey, title: movies.title, releaseYear: movies.releaseYear })
        .from(movies);
      assertNoMovieIdentityConflicts(catalog, existingMovies);

      const genreIdBySourceKey = new Map<string, number>();
      for (const genre of catalog.genres) {
        const existingMatches = genresByNormalizedName.get(normalizedGenreName(genre.nameUk)) ?? [];
        if (existingMatches.length > 1) {
          throw new Error(`Seed genre "${genre.nameUk}" matches multiple existing genre rows.`);
        }
        const existing = existingMatches[0];
        if (existing && existing.name !== genre.nameUk) {
          throw new Error(`Seed genre "${genre.nameUk}" conflicts with existing spelling "${existing.name}".`);
        }
        if (existing) {
          genreIdBySourceKey.set(genre.key, existing.id);
          continue;
        }
        const [created] = await transaction.insert(genres).values({ name: genre.nameUk }).returning({ id: genres.id, name: genres.name });
        if (!created) {
          throw new Error(`Could not create genre "${genre.nameUk}".`);
        }
        genresByNormalizedName.set(normalizedGenreName(created.name), [created]);
        genreIdBySourceKey.set(genre.key, created.id);
      }

      const existingMovieBySeedKey = new Map(existingMovies.filter(movie => movie.seedKey !== null).map(movie => [movie.seedKey as string, movie]));
      let insertedMovieCount = 0;
      let updatedMovieCount = 0;
      let linkCount = 0;

      for (const movie of catalog.movies) {
        const existing = existingMovieBySeedKey.get(movie.seedKey);
        let movieId: number;
        if (existing) {
          await transaction.update(movies).set(movieValues(movie)).where(eq(movies.id, existing.id));
          movieId = existing.id;
          updatedMovieCount += 1;
        } else {
          const [created] = await transaction.insert(movies).values(movieValues(movie)).returning({ id: movies.id });
          if (!created) {
            throw new Error(`Could not create movie with seed key "${movie.seedKey}".`);
          }
          movieId = created.id;
          insertedMovieCount += 1;
        }

        await transaction.delete(movieGenres).where(eq(movieGenres.movieId, movieId));
        const links = movie.genreKeys.map(genreKey => {
          const genreId = genreIdBySourceKey.get(genreKey);
          if (genreId === undefined) {
            throw new Error(`Validated genre key "${genreKey}" could not be resolved.`);
          }
          return { movieId, genreId };
        });
        await transaction.insert(movieGenres).values(links);
        linkCount += links.length;
      }

      return { genreCount: catalog.genres.length, insertedMovieCount, linkCount, updatedMovieCount };
    });
  }
}
