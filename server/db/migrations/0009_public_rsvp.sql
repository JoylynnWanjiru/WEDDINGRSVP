ALTER TYPE "public"."invitation_source" ADD VALUE 'public';--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"device" text NOT NULL,
	"invitation_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"visits" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_visits_wedding_device_uq" ON "site_visits" USING btree ("wedding_id","device_hash");--> statement-breakpoint
CREATE INDEX "site_visits_wedding_seen_idx" ON "site_visits" USING btree ("wedding_id","last_seen_at");