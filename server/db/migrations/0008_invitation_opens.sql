CREATE TABLE "invitation_opens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"device" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"taps" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "link_copied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation_opens" ADD CONSTRAINT "invitation_opens_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_opens" ADD CONSTRAINT "invitation_opens_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_opens_invitation_idx" ON "invitation_opens" USING btree ("invitation_id","opened_at");--> statement-breakpoint
CREATE INDEX "invitation_opens_wedding_idx" ON "invitation_opens" USING btree ("wedding_id","last_seen_at");