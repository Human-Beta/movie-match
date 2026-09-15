ALTER TABLE "rooms" DROP CONSTRAINT "rooms_exhaustion_reason_check";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "exhaustion_reason";--> statement-breakpoint
DROP TYPE "public"."room_exhaustion_reason";