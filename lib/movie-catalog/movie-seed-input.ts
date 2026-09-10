import { z } from "zod";

const seedKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase ASCII slug");

const canonicalTextSchema = (maximumLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maximumLength)
    .refine(value => value === value.trim(), "must not have leading or trailing whitespace")
    .refine(value => !/\s{2,}/u.test(value), "must not contain repeated whitespace");

const genreSchema = z.strictObject({
  key: seedKeySchema,
  nameUk: canonicalTextSchema(50),
});

const posterSchema = z.strictObject({
  path: canonicalTextSchema(500),
  sourceUrl: z.url(),
  usageTerms: canonicalTextSchema(500),
});

const movieSchema = z.strictObject({
  seedKey: seedKeySchema,
  titleUk: canonicalTextSchema(200),
  releaseYear: z.int().min(1888).max(32767),
  runtimeMinutes: z.int().positive().max(32767),
  genreKeys: z.array(seedKeySchema).min(1),
  availableOnNetflix: z.boolean(),
  poster: posterSchema.nullable(),
});

const metadataSchema = z.strictObject({
  curationNotes: canonicalTextSchema(1000),
  netflixRegion: z.string().regex(/^[A-Z]{2}$/, "must be a two-letter uppercase country code"),
  netflixVerifiedOn: z.iso.date(),
});

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("uk-UA");
}

function addDuplicateIssues(
  values: ReadonlyArray<string>,
  pathPrefix: ReadonlyArray<string | number>,
  field: string,
  context: z.RefinementCtx,
): void {
  const positions = new Map<string, number>();
  values.forEach((value, index) => {
    const normalized = normalizedText(value);
    const firstIndex = positions.get(normalized);
    if (firstIndex === undefined) {
      positions.set(normalized, index);
      return;
    }
    context.addIssue({
      code: "custom",
      message: `duplicates ${field} at index ${firstIndex}`,
      path: [...pathPrefix, index],
    });
  });
}

export const movieSeedCatalogSchema = z
  .strictObject({
    metadata: metadataSchema,
    genres: z.array(genreSchema).min(1),
    movies: z.array(movieSchema).min(50),
  })
  .superRefine((catalog, context) => {
    addDuplicateIssues(
      catalog.genres.map(genre => genre.key),
      ["genres"],
      "genre key",
      context,
    );
    addDuplicateIssues(
      catalog.genres.map(genre => genre.nameUk),
      ["genres"],
      "canonical genre name",
      context,
    );
    addDuplicateIssues(
      catalog.movies.map(movie => movie.seedKey),
      ["movies"],
      "movie seed key",
      context,
    );
    addDuplicateIssues(
      catalog.movies.map(movie => `${movie.titleUk}\u0000${movie.releaseYear}`),
      ["movies"],
      "movie title and release year",
      context,
    );

    const genreKeys = new Set(catalog.genres.map(genre => genre.key));
    catalog.movies.forEach((movie, movieIndex) => {
      addDuplicateIssues(movie.genreKeys, ["movies", movieIndex, "genreKeys"], "genre link", context);
      movie.genreKeys.forEach((genreKey, genreIndex) => {
        if (!genreKeys.has(genreKey)) {
          context.addIssue({
            code: "custom",
            message: `references unknown genre key "${genreKey}"`,
            path: ["movies", movieIndex, "genreKeys", genreIndex],
          });
        }
      });
    });

    const diversityChecks: ReadonlyArray<readonly [boolean, string]> = [
      [catalog.movies.some(movie => movie.releaseYear <= 2010), "must include a movie released in or before 2010"],
      [catalog.movies.some(movie => movie.releaseYear > 2010), "must include a movie released after 2010"],
      [catalog.movies.some(movie => movie.runtimeMinutes < 120), "must include a movie shorter than 120 minutes"],
      [catalog.movies.some(movie => movie.runtimeMinutes >= 120), "must include a movie lasting at least 120 minutes"],
      [catalog.movies.some(movie => movie.availableOnNetflix), "must include a movie available on Netflix"],
      [catalog.movies.some(movie => !movie.availableOnNetflix), "must include a movie not available on Netflix"],
      [catalog.movies.some(movie => movie.genreKeys.length > 1), "must include a movie with multiple genres"],
    ];
    diversityChecks.forEach(([satisfied, message]) => {
      if (!satisfied) {
        context.addIssue({ code: "custom", message, path: ["movies"] });
      }
    });
  });

export type MovieSeedCatalog = z.infer<typeof movieSeedCatalogSchema>;
export type MovieSeedMovie = MovieSeedCatalog["movies"][number];

export function parseMovieSeedCatalog(input: MovieSeedCatalog): MovieSeedCatalog {
  return movieSeedCatalogSchema.parse(input);
}
