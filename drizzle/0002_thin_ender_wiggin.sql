ALTER TABLE "rooms" ADD COLUMN "creation_request_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_creation_request_id_unique" UNIQUE("creation_request_id");