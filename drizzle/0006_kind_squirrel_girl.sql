CREATE TYPE "public"."room_game_command" AS ENUM('start', 'restart');--> statement-breakpoint
CREATE TYPE "public"."room_game_command_outcome" AS ENUM('started', 'exhausted');--> statement-breakpoint
ALTER TABLE "room_game_commands" DROP CONSTRAINT "room_game_commands_command_check";--> statement-breakpoint
ALTER TABLE "room_game_commands" DROP CONSTRAINT "room_game_commands_outcome_check";--> statement-breakpoint
ALTER TABLE "room_game_commands" ALTER COLUMN "command" SET DATA TYPE "public"."room_game_command" USING "command"::"public"."room_game_command";--> statement-breakpoint
ALTER TABLE "room_game_commands" ALTER COLUMN "outcome" SET DATA TYPE "public"."room_game_command_outcome" USING "outcome"::"public"."room_game_command_outcome";