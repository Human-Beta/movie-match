CREATE TYPE "public"."no_match_next_round_outcome" AS ENUM('ready', 'started', 'list_exhausted');--> statement-breakpoint
CREATE TABLE "no_match_round_readiness" (
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"outcome" "no_match_next_round_outcome" NOT NULL,
	CONSTRAINT "no_match_round_readiness_pkey" PRIMARY KEY("room_id","round_id","participant_id"),
	CONSTRAINT "no_match_round_readiness_room_participant_request_unique" UNIQUE("room_id","participant_id","request_id"),
	CONSTRAINT "no_match_round_readiness_payload_hash_check" CHECK ("no_match_round_readiness"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "no_match_round_readiness" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "no_match_round_readiness" FROM public, anon, authenticated, service_role;--> statement-breakpoint
ALTER TABLE "no_match_round_readiness" ADD CONSTRAINT "no_match_round_readiness_round_fk" FOREIGN KEY ("room_id","round_id") REFERENCES "public"."rounds"("room_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_match_round_readiness" ADD CONSTRAINT "no_match_round_readiness_room_participant_fk" FOREIGN KEY ("room_id","participant_id") REFERENCES "public"."participants"("room_id","id") ON DELETE cascade ON UPDATE no action;
