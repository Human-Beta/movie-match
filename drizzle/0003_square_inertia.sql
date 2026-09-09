CREATE TABLE "room_filter_saves" (
	"room_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	CONSTRAINT "room_filter_saves_pkey" PRIMARY KEY("room_id","request_id"),
	CONSTRAINT "room_filter_saves_payload_hash_check" CHECK ("room_filter_saves"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "room_filter_saves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_filter_saves" ADD CONSTRAINT "room_filter_saves_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON TABLE "room_filter_saves" FROM anon, authenticated, service_role;
