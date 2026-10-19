CREATE TYPE "public"."actor" AS ENUM('admin', 'guest', 'usher', 'system', 'public');--> statement-breakpoint
CREATE TYPE "public"."check_in_method" AS ENUM('scan', 'manual', 'offline_sync');--> statement-breakpoint
CREATE TYPE "public"."dietary" AS ENUM('none', 'vegetarian', 'vegan', 'halal', 'gluten_free', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_template" AS ENUM('invitation', 'rsvp_received', 'approval_pass', 'reminder_no_response', 'reminder_day_before', 'revoked', 'details_updated');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('ceremony', 'reception', 'traditional');--> statement-breakpoint
CREATE TYPE "public"."invitation_source" AS ENUM('admin', 'import', 'request');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('draft', 'sent', 'viewed', 'awaiting_approval', 'declined', 'approved', 'not_approved', 'partially_arrived', 'arrived', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('bride', 'groom', 'both');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"actor" "actor" NOT NULL,
	"actor_label" text,
	"invitation_id" uuid,
	"action" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"wedding_id" uuid PRIMARY KEY NOT NULL,
	"usher_pin_hash" text,
	"usher_session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"count" integer NOT NULL,
	"method" "check_in_method" NOT NULL,
	"usher_device" text,
	"client_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_ins_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "check_ins_count_ck" CHECK ("check_ins"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dress_code" (
	"wedding_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"swatches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"invitation_id" uuid,
	"template" "email_template" NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_queue_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "faq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"message" text,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"ip_hash" text,
	"invitation_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wedding_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"group" text,
	"side" "side",
	"seat_allowance" integer DEFAULT 0 NOT NULL,
	"status" "invitation_status" DEFAULT 'draft' NOT NULL,
	"status_before_revoke" "invitation_status",
	"source" "invitation_source" DEFAULT 'admin' NOT NULL,
	"response_message" text,
	"notes" text,
	"invite_token_version" integer DEFAULT 1 NOT NULL,
	"invite_token_hash" text NOT NULL,
	"pass_version" integer DEFAULT 1 NOT NULL,
	"party_size" integer DEFAULT 1 NOT NULL,
	"arrived_count" integer DEFAULT 0 NOT NULL,
	"email_sent_at" timestamp with time zone,
	"whatsapp_shared_at" timestamp with time zone,
	"email_opened_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"responded_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"pass_emailed_at" timestamp with time zone,
	"pass_first_viewed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_invite_token_hash_unique" UNIQUE("invite_token_hash"),
	CONSTRAINT "invitations_seat_allowance_ck" CHECK ("invitations"."seat_allowance" >= 0),
	CONSTRAINT "invitations_party_size_ck" CHECK ("invitations"."party_size" >= 1),
	CONSTRAINT "invitations_arrived_ck" CHECK ("invitations"."arrived_count" >= 0 AND "invitations"."arrived_count" <= "invitations"."party_size")
);
--> statement-breakpoint
CREATE TABLE "party_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"is_child" boolean DEFAULT false NOT NULL,
	"dietary" "dietary" DEFAULT 'none' NOT NULL,
	"dietary_notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"section" text NOT NULL,
	"src" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programme_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"venue_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvp_events" (
	"invitation_id" uuid NOT NULL,
	"event" "event_kind" NOT NULL,
	"attending" boolean NOT NULL,
	CONSTRAINT "rsvp_events_invitation_id_event_pk" PRIMARY KEY("invitation_id","event")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"kind" "event_kind" NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"landmarks" text,
	"lat" double precision,
	"lng" double precision,
	"parking_notes" text,
	"map_image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"bride_name" text NOT NULL,
	"groom_name" text NOT NULL,
	"monogram" text,
	"wedding_date" date NOT NULL,
	"ceremony_start_at" timestamp with time zone NOT NULL,
	"gates_open_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"rsvp_deadline" timestamp with time zone NOT NULL,
	"venue_capacity" integer,
	"story_text" text,
	"hashtag" text,
	"theme" jsonb,
	"whatsapp_template" text,
	"contribution_info" jsonb,
	"default_seat_allowance" integer DEFAULT 0 NOT NULL,
	"daily_email_cap" integer DEFAULT 400 NOT NULL,
	"reminder_interval_days" integer DEFAULT 3 NOT NULL,
	"purge_after_days" integer DEFAULT 30 NOT NULL,
	"require_phone_check" boolean DEFAULT false NOT NULL,
	"public_requests_enabled" boolean DEFAULT true NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weddings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dress_code" ADD CONSTRAINT "dress_code_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD CONSTRAINT "invitation_requests_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_requests" ADD CONSTRAINT "invitation_requests_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_members" ADD CONSTRAINT "party_members_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_items" ADD CONSTRAINT "programme_items_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_items" ADD CONSTRAINT "programme_items_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_events" ADD CONSTRAINT "rsvp_events_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_wedding_at_idx" ON "activity_log" USING btree ("wedding_id","at");--> statement-breakpoint
CREATE INDEX "activity_invitation_idx" ON "activity_log" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "check_ins_invitation_idx" ON "check_ins" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "email_queue_pending_idx" ON "email_queue" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "invitation_requests_wedding_status_idx" ON "invitation_requests" USING btree ("wedding_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_wedding_phone_uq" ON "invitations" USING btree ("wedding_id","phone");--> statement-breakpoint
CREATE INDEX "invitations_wedding_status_idx" ON "invitations" USING btree ("wedding_id","status");--> statement-breakpoint
CREATE INDEX "party_members_invitation_idx" ON "party_members" USING btree ("invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_members_one_primary_uq" ON "party_members" USING btree ("invitation_id") WHERE "party_members"."is_primary";--> statement-breakpoint
CREATE INDEX "programme_wedding_idx" ON "programme_items" USING btree ("wedding_id","starts_at");--> statement-breakpoint
CREATE INDEX "venues_wedding_idx" ON "venues" USING btree ("wedding_id");