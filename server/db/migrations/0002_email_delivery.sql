ALTER TABLE "email_queue" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "email_bounced_at" timestamp with time zone;