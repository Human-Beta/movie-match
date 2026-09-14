CREATE TYPE "public"."room_exhaustion_reason" AS ENUM('catalog_insufficient', 'list_exhausted');--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "exhaustion_reason" "room_exhaustion_reason";--> statement-breakpoint
UPDATE "rooms" AS room
SET "exhaustion_reason" = CASE
  WHEN (
    SELECT count(*)
    FROM "movies" AS movie
    WHERE (NOT room."netflix_only" OR movie."available_on_netflix")
      AND (NOT room."under_two_hours" OR movie."runtime_minutes" < 120)
      AND (room."year_filter" = 'any'
        OR (room."year_filter" = 'new' AND movie."release_year" > 2010)
        OR (room."year_filter" = 'old' AND movie."release_year" <= 2010))
      AND (
        NOT EXISTS (SELECT 1 FROM "room_genres" WHERE "room_id" = room."id")
        OR EXISTS (
          SELECT 1
          FROM "movie_genres"
          INNER JOIN "room_genres" ON "room_genres"."genre_id" = "movie_genres"."genre_id"
          WHERE "movie_genres"."movie_id" = movie."id"
            AND "room_genres"."room_id" = room."id"
        )
      )
  ) >= 3 THEN 'list_exhausted'::"room_exhaustion_reason"
  ELSE 'catalog_insufficient'::"room_exhaustion_reason"
END
WHERE room."status" = 'exhausted';--> statement-breakpoint
ALTER TABLE "room_game_commands" ALTER COLUMN "outcome" SET DATA TYPE text;--> statement-breakpoint
UPDATE "room_game_commands" SET "outcome" = 'list_exhausted' WHERE "outcome" = 'exhausted';--> statement-breakpoint
DROP TYPE "public"."room_game_command_outcome";--> statement-breakpoint
CREATE TYPE "public"."room_game_command_outcome" AS ENUM('started', 'catalog_insufficient', 'list_exhausted');--> statement-breakpoint
ALTER TABLE "room_game_commands" ALTER COLUMN "outcome" SET DATA TYPE "public"."room_game_command_outcome" USING "outcome"::"public"."room_game_command_outcome";--> statement-breakpoint
