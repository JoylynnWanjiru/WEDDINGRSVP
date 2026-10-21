CREATE TABLE "vendor_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"count" integer NOT NULL,
	"method" "check_in_method" NOT NULL,
	"usher_device" text,
	"client_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_check_ins_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "vendor_check_ins_count_ck" CHECK ("vendor_check_ins"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wedding_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"staff_count" integer DEFAULT 1 NOT NULL,
	"meal_count" integer DEFAULT 0 NOT NULL,
	"arrive_at" timestamp with time zone,
	"instructions" text,
	"notes" text,
	"link_version" integer DEFAULT 1 NOT NULL,
	"link_token_hash" text NOT NULL,
	"pass_version" integer DEFAULT 1 NOT NULL,
	"arrived_count" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_link_token_hash_unique" UNIQUE("link_token_hash"),
	CONSTRAINT "vendors_staff_ck" CHECK ("vendors"."staff_count" >= 1),
	CONSTRAINT "vendors_meal_ck" CHECK ("vendors"."meal_count" >= 0),
	CONSTRAINT "vendors_arrived_ck" CHECK ("vendors"."arrived_count" >= 0 AND "vendors"."arrived_count" <= "vendors"."staff_count")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_check_ins" ADD CONSTRAINT "vendor_check_ins_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_ins" ADD CONSTRAINT "vendor_check_ins_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_check_ins_vendor_idx" ON "vendor_check_ins" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendors_wedding_idx" ON "vendors" USING btree ("wedding_id");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;