import { config } from "dotenv";
import { ZodError } from "zod";

import { movieSeedCatalogSource } from "@/lib/movie-catalog/movie-seed-catalog";
import { parseMovieSeedCatalog } from "@/lib/movie-catalog/movie-seed-input";
import { DrizzleMovieSeedRepository } from "@/lib/movie-catalog/movie-seed-repository";

config({ path: ".env.local", quiet: true });

async function run(): Promise<void> {
  const catalog = parseMovieSeedCatalog(movieSeedCatalogSource);
  const { closeDatabase, db } = await import("@/lib/db");

  try {
    const result = await new DrizzleMovieSeedRepository(async () => db).seed(catalog);
    process.stdout.write(
      `Seeded ${catalog.movies.length} movies and ${result.linkCount} genre links (${result.insertedMovieCount} inserted, ${result.updatedMovieCount} updated).\n`,
    );
  } finally {
    await closeDatabase();
  }
}

run().catch((error: unknown) => {
  if (error instanceof ZodError) {
    process.stderr.write(`Movie seed catalog is invalid:\n${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`Movie seed failed: ${error.message}\n`);
  } else {
    process.stderr.write("Movie seed failed with an unknown error.\n");
  }
  process.exitCode = 1;
});
