import assert from "node:assert/strict";
import test from "node:test";

import { movieSeedCatalogSource } from "@/lib/movie-catalog/movie-seed-catalog";
import { parseMovieSeedCatalog, type MovieSeedCatalog } from "@/lib/movie-catalog/movie-seed-input";

function validCatalog(): MovieSeedCatalog {
  return {
    metadata: {
      curationNotes: "Manually curated for the Movie Match v0.1 catalog.",
      netflixRegion: "UA",
      netflixVerifiedOn: "2026-09-09",
    },
    genres: [
      { key: "drama", nameUk: "Драма" },
      { key: "comedy", nameUk: "Комедія" },
    ],
    movies: Array.from({ length: 50 }, (_, index) => ({
      seedKey: `movie-${index + 1}`,
      titleUk: `Фільм ${index + 1}`,
      releaseYear: index % 2 === 0 ? 2010 : 2011,
      runtimeMinutes: index % 2 === 0 ? 119 : 120,
      genreKeys: index === 0 ? ["drama", "comedy"] : [index % 2 === 0 ? "drama" : "comedy"],
      availableOnNetflix: index % 2 === 0,
      poster: null,
    })),
  };
}

test("accepts a complete, diverse and internally consistent movie catalog", () => {
  const catalog = parseMovieSeedCatalog(validCatalog());

  assert.equal(catalog.movies.length, 50);
  assert.equal(catalog.genres.length, 2);
});

test("accepts an owner-curated catalog larger than 100 movies", () => {
  const input = validCatalog();
  input.movies.push(
    ...Array.from({ length: 51 }, (_, index) => ({
      availableOnNetflix: index % 2 === 0,
      genreKeys: [index % 2 === 0 ? "drama" : "comedy"],
      poster: null,
      releaseYear: 2012,
      runtimeMinutes: 100,
      seedKey: `extra-movie-${index + 1}`,
      titleUk: `Додатковий фільм ${index + 1}`,
    })),
  );

  const catalog = parseMovieSeedCatalog(input);

  assert.equal(catalog.movies.length, 101);
});

test("validates the committed owner-curated movie catalog", () => {
  const catalog = parseMovieSeedCatalog(movieSeedCatalogSource);

  assert.equal(catalog.movies.length, 119);
  assert.equal(catalog.genres.length, 19);
  assert.deepEqual(
    catalog.movies.filter(movie => movie.availableOnNetflix).map(movie => movie.titleUk),
    ["Основні принципи добра", "Боксер", "Список мрій"],
  );
});

test("rejects duplicate identities, duplicate links and unknown genre references", () => {
  const input = validCatalog();
  input.genres.push({ key: "other-drama", nameUk: "драма" });
  input.movies[1] = {
    ...input.movies[0]!,
    genreKeys: ["drama", "drama", "missing"],
  };

  assert.throws(
    () => parseMovieSeedCatalog(input),
    error =>
      error instanceof Error &&
      error.message.includes("canonical genre name") &&
      error.message.includes("movie seed key") &&
      error.message.includes("genre link") &&
      error.message.includes("unknown genre key"),
  );
});

test("rejects catalogs that do not exercise every v0.1 filter group", () => {
  const input = validCatalog();
  input.movies.forEach(movie => {
    movie.availableOnNetflix = true;
    movie.genreKeys = ["drama"];
    movie.releaseYear = 2011;
    movie.runtimeMinutes = 119;
  });

  assert.throws(
    () => parseMovieSeedCatalog(input),
    error =>
      error instanceof Error &&
      error.message.includes("in or before 2010") &&
      error.message.includes("lasting at least 120 minutes") &&
      error.message.includes("not available on Netflix") &&
      error.message.includes("multiple genres"),
  );
});
