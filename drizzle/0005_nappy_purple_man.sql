CREATE TABLE "room_game_commands" (
	"room_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"command" varchar(16) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"outcome" varchar(16) NOT NULL,
	CONSTRAINT "room_game_commands_pkey" PRIMARY KEY("room_id","request_id"),
	CONSTRAINT "room_game_commands_command_check" CHECK ("room_game_commands"."command" in ('start', 'restart')),
	CONSTRAINT "room_game_commands_payload_hash_check" CHECK ("room_game_commands"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "room_game_commands_outcome_check" CHECK ("room_game_commands"."outcome" in ('started', 'exhausted'))
);
--> statement-breakpoint
ALTER TABLE "room_game_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_game_commands" ADD CONSTRAINT "room_game_commands_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON TABLE "room_game_commands" FROM public, anon, authenticated, service_role;
