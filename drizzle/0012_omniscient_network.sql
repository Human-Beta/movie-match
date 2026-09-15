CREATE TABLE "round_ballots" (
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	CONSTRAINT "round_ballots_pkey" PRIMARY KEY("room_id","round_id","participant_id"),
	CONSTRAINT "round_ballots_room_participant_request_unique" UNIQUE("room_id","participant_id","request_id"),
	CONSTRAINT "round_ballots_payload_hash_check" CHECK ("round_ballots"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "round_ballots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "round_ballots" FROM "anon", "authenticated";--> statement-breakpoint
ALTER TABLE "round_ballots" ADD CONSTRAINT "round_ballots_round_fk" FOREIGN KEY ("room_id","round_id") REFERENCES "public"."rounds"("room_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_ballots" ADD CONSTRAINT "round_ballots_room_participant_fk" FOREIGN KEY ("room_id","participant_id") REFERENCES "public"."participants"("room_id","id") ON DELETE cascade ON UPDATE no action;
