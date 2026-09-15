ALTER TABLE "rooms" DROP CONSTRAINT "rooms_exhaustion_reason_check";--> statement-breakpoint
UPDATE "rooms" SET "status" = 'waiting', "exhaustion_reason" = NULL WHERE "exhaustion_reason" = 'catalog_insufficient';--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "exhaustion_reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."room_exhaustion_reason";--> statement-breakpoint
CREATE TYPE "public"."room_exhaustion_reason" AS ENUM('list_exhausted');--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "exhaustion_reason" SET DATA TYPE "public"."room_exhaustion_reason" USING "exhaustion_reason"::"public"."room_exhaustion_reason";--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_exhaustion_reason_check" CHECK (("status" = 'exhausted') = ("exhaustion_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "room_game_commands" ADD COLUMN "filter_hash" varchar(64);--> statement-breakpoint
UPDATE "room_game_commands" SET "filter_hash" = repeat('0', 64) WHERE "filter_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "room_game_commands" ALTER COLUMN "filter_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_game_commands" ADD CONSTRAINT "room_game_commands_filter_hash_check" CHECK ("room_game_commands"."filter_hash" ~ '^[a-f0-9]{64}$');
