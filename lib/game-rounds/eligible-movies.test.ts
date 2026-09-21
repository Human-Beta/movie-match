import assert from "node:assert/strict";
import test from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import { getEligibleMovieConditions } from "@/lib/game-rounds/eligible-movies";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

const dialect = new PgDialect();
const noFilters: RoomFilterValues = { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [] };

function renderConditions(filters: RoomFilterValues, excludeSeen: boolean): readonly { sql: string; params: unknown[] }[] {
  return getEligibleMovieConditions("room-id", filters, excludeSeen).map(condition => dialect.sqlToQuery(condition));
}

test("eligible-movie conditions omit optional filters", () => {
  assert.deepEqual(renderConditions(noFilters, false), []);
});

test("eligible-movie conditions apply every saved filter", () => {
  const conditions = renderConditions({ netflixOnly: true, underTwoHours: true, yearFilter: "new", genreIds: [2, 5] }, false);

  assert.equal(conditions.length, 4);
  assert.equal(
    conditions.some(condition => condition.sql.includes('"movies"."available_on_netflix"')),
    true,
  );
  assert.equal(
    conditions.some(condition => condition.sql.includes('"movies"."runtime_minutes" < 120')),
    true,
  );
  assert.equal(
    conditions.some(condition => condition.sql.includes('"movies"."release_year" > 2010')),
    true,
  );
  assert.equal(
    conditions.some(condition => condition.sql.includes('"movie_genres"."genre_id" in')),
    true,
  );
  assert.equal(
    conditions.some(condition => condition.params.includes(2) && condition.params.includes(5)),
    true,
  );
});

test("eligible-movie conditions exclude movies previously shown in the room", () => {
  const conditions = renderConditions(noFilters, true);

  assert.equal(conditions.length, 1);
  assert.match(conditions[0]?.sql ?? "", /not exists/);
  assert.equal(conditions[0]?.params.includes("room-id"), true);
});
