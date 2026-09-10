ALTER TABLE "movies" ADD COLUMN "seed_key" varchar(100);--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_seed_key_unique" UNIQUE("seed_key");--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_seed_key_not_blank" CHECK ("movies"."seed_key" is null or btrim("movies"."seed_key") <> '');