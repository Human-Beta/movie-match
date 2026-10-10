CREATE TABLE "room_creation_requests" (
	"request_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_creation_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "room_creation_requests" FROM anon, authenticated;
--> statement-breakpoint
INSERT INTO "room_creation_requests" ("request_id")
SELECT "creation_request_id" FROM "rooms" WHERE "creation_request_id" IS NOT NULL
ON CONFLICT DO NOTHING;
