import { eq, inArray, sql, type SQL } from "drizzle-orm";

import { movieGenres, movies, roundMovies } from "@/lib/db/schema";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

export function getEligibleMovieConditions(roomId: string, filters: RoomFilterValues, excludeSeen: boolean): SQL[] {
  const conditions: SQL[] = [];

  if (filters.netflixOnly) {
    conditions.push(eq(movies.availableOnNetflix, true));
  }
  if (filters.underTwoHours) {
    conditions.push(sql`${movies.runtimeMinutes} < 120`);
  }
  if (filters.yearFilter === "new") {
    conditions.push(sql`${movies.releaseYear} > 2010`);
  } else if (filters.yearFilter === "old") {
    conditions.push(sql`${movies.releaseYear} <= 2010`);
  }
  if (filters.genreIds.length > 0) {
    conditions.push(sql`exists (
      select 1 from ${movieGenres}
      where ${movieGenres.movieId} = ${movies.id}
        and ${inArray(movieGenres.genreId, filters.genreIds)}
    )`);
  }
  if (excludeSeen) {
    conditions.push(sql`not exists (
      select 1 from ${roundMovies}
      where ${roundMovies.roomId} = ${roomId}
        and ${roundMovies.movieId} = ${movies.id}
    )`);
  }

  return conditions;
}
