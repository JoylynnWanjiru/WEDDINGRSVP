// Drizzle tables (PROJECT_SPEC §11, BLUEPRINT §8). Top-level tables carry wedding_id
// for future multi-couple use. The invitation table is `invitations` (spec calls it `guests`).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { INVITATION_STATUSES, REQUEST_STATUSES } from "../domain/status";

const tz = (name: string) => timestamp(name, { withTimezone: true });

const timestamps = {
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// --- enums ---

export const invitationStatus = pgEnum("invitation_status", INVITATION_STATUSES);
export const requestStatus = pgEnum("request_status", REQUEST_STATUSES);
export const invitationSource = pgEnum("invitation_source", ["admin", "import", "request"]);
export const side = pgEnum("side", ["bride", "groom", "both"]);
export const eventKind = pgEnum("event_kind", ["ceremony", "reception", "traditional"]);
export const dietary = pgEnum("dietary", ["none", "vegetarian", "vegan", "halal", "gluten_free", "other"]);
export const actor = pgEnum("actor", ["admin", "guest", "usher", "system", "public"]);
export const checkInMethod = pgEnum("check_in_method", ["scan", "manual", "offline_sync"]);
export const emailTemplate = pgEnum("email_template", [
  "invitation",
  "rsvp_received",
  "approval_pass",
  "reminder_no_response",
  "reminder_day_before",
  "revoked",
  "details_updated",
]);
export const emailStatus = pgEnum("email_status", ["queued", "sending", "sent", "failed", "cancelled"]);

// --- wedding & content ---

export const weddings = pgTable("weddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  brideName: text("bride_name").notNull(),
  groomName: text("groom_name").notNull(),
  monogram: text("monogram"),
  weddingDate: date("wedding_date", { mode: "string" }).notNull(),
  ceremonyStartAt: tz("ceremony_start_at").notNull(),
  gatesOpenAt: tz("gates_open_at").notNull(),
  timezone: text("timezone").notNull().default("Africa/Nairobi"),
  rsvpDeadline: tz("rsvp_deadline").notNull(),
  venueCapacity: integer("venue_capacity"),
  storyText: text("story_text"),
  hashtag: text("hashtag"),
  theme: jsonb("theme").$type<Record<string, string>>(),
  whatsappTemplate: text("whatsapp_template"),
  contributionInfo: jsonb("contribution_info").$type<Record<string, string>>(),
  // Assumption defaults from BLUEPRINT §11, editable in settings.
  defaultSeatAllowance: integer("default_seat_allowance").notNull().default(0), // A2
  dailyEmailCap: integer("daily_email_cap").notNull().default(400), // A9, BR-17
  reminderIntervalDays: integer("reminder_interval_days").notNull().default(3), // A9, BR-19
  purgeAfterDays: integer("purge_after_days").notNull().default(30), // A10, BR-23
  requirePhoneCheck: boolean("require_phone_check").notNull().default(false), // A8, E2
  publicRequestsEnabled: boolean("public_requests_enabled").notNull().default(true), // A11
  purgedAt: tz("purged_at"),
  ...timestamps,
});

export const adminSettings = pgTable("admin_settings", {
  weddingId: uuid("wedding_id")
    .primaryKey()
    .references(() => weddings.id, { onDelete: "cascade" }),
  usherPinHash: text("usher_pin_hash"),
  // Bumped on PIN change and "sign out all ushers": every older usher session stops working.
  usherSessionVersion: integer("usher_session_version").notNull().default(1),
  ...timestamps,
});

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    kind: eventKind("kind").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    landmarks: text("landmarks"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    parkingNotes: text("parking_notes"),
    mapImageUrl: text("map_image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("venues_wedding_idx").on(t.weddingId)],
);

export const programmeItems = pgTable(
  "programme_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    startsAt: tz("starts_at").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    // No visibility flag: the whole programme is approved-only (BR-1).
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("programme_wedding_idx").on(t.weddingId, t.startsAt)],
);

export const faqItems = pgTable("faq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  weddingId: uuid("wedding_id")
    .notNull()
    .references(() => weddings.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const dressCode = pgTable("dress_code", {
  weddingId: uuid("wedding_id")
    .primaryKey()
    .references(() => weddings.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  swatches: jsonb("swatches").$type<{ name: string; hex: string }[]>().notNull().default([]),
  ...timestamps,
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  weddingId: uuid("wedding_id")
    .notNull()
    .references(() => weddings.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  weddingId: uuid("wedding_id")
    .notNull()
    .references(() => weddings.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  src: text("src").notNull(),
  alt: text("alt").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

// --- invitations (one per household / party) ---

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(), // generated in app: the invite token is derived from it
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"), // E.164 (BR-20)
    group: text("group"),
    side: side("side"),
    seatAllowance: integer("seat_allowance").notNull().default(0),
    status: invitationStatus("status").notNull().default("draft"),
    statusBeforeRevoke: invitationStatus("status_before_revoke"),
    source: invitationSource("source").notNull().default("admin"),
    responseMessage: text("response_message"),
    // Hash of the last submitted RSVP: an identical resubmission is a no-op (BR-9, E1).
    responseFingerprint: text("response_fingerprint"),
    notes: text("notes"),
    inviteTokenVersion: integer("invite_token_version").notNull().default(1),
    inviteTokenHash: text("invite_token_hash").notNull().unique(),
    passVersion: integer("pass_version").notNull().default(1),
    partySize: integer("party_size").notNull().default(1),
    arrivedCount: integer("arrived_count").notNull().default(0),
    emailSentAt: tz("email_sent_at"),
    whatsappSharedAt: tz("whatsapp_shared_at"),
    emailOpenedAt: tz("email_opened_at"),
    firstViewedAt: tz("first_viewed_at"),
    lastViewedAt: tz("last_viewed_at"),
    viewCount: integer("view_count").notNull().default(0),
    respondedAt: tz("responded_at"),
    approvedAt: tz("approved_at"), // the pass exists from this moment
    passEmailedAt: tz("pass_emailed_at"), // delivery fact, not a status (D2)
    passFirstViewedAt: tz("pass_first_viewed_at"),
    revokedAt: tz("revoked_at"),
    lastReminderAt: tz("last_reminder_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_wedding_phone_uq").on(t.weddingId, t.phone), // BR-21
    index("invitations_wedding_status_idx").on(t.weddingId, t.status),
    check("invitations_seat_allowance_ck", sql`${t.seatAllowance} >= 0`),
    check("invitations_party_size_ck", sql`${t.partySize} >= 1`),
    check("invitations_arrived_ck", sql`${t.arrivedCount} >= 0 AND ${t.arrivedCount} <= ${t.partySize}`), // BR-14
  ],
);

// Public "request an invitation" submissions. Untrusted input stays out of
// `invitations` until the couple accepts it (D3), so spam can't block a real
// guest's phone (BR-21) or appear in the guest list and totals.
export const invitationRequests = pgTable(
  "invitation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phone: text("phone"), // E.164; deliberately NOT unique
    email: text("email"),
    message: text("message"),
    status: requestStatus("status").notNull().default("pending"),
    ipHash: text("ip_hash"), // never the raw IP
    invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "set null" }),
    reviewedAt: tz("reviewed_at"),
    reviewNote: text("review_note"), // internal only
    ...timestamps,
  },
  (t) => [index("invitation_requests_wedding_status_idx").on(t.weddingId, t.status)],
);

export const partyMembers = pgTable(
  "party_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    isChild: boolean("is_child").notNull().default(false),
    dietary: dietary("dietary").notNull().default("none"),
    dietaryNotes: text("dietary_notes"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("party_members_invitation_idx").on(t.invitationId),
    uniqueIndex("party_members_one_primary_uq").on(t.invitationId).where(sql`${t.isPrimary}`),
  ],
);

export const rsvpEvents = pgTable(
  "rsvp_events",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    event: eventKind("event").notNull(),
    attending: boolean("attending").notNull(),
  },
  (t) => [primaryKey({ columns: [t.invitationId, t.event] })],
);

// --- gate, messaging, audit ---

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    count: integer("count").notNull(),
    method: checkInMethod("method").notNull(),
    usherDevice: text("usher_device"),
    clientRef: text("client_ref").unique(), // idempotency key for offline sync
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("check_ins_invitation_idx").on(t.invitationId), check("check_ins_count_ck", sql`${t.count} > 0`)],
);

export const emailQueue = pgTable(
  "email_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "cascade" }),
    template: emailTemplate("template").notNull(),
    status: emailStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key").unique(),
    scheduledFor: tz("scheduled_for").notNull().defaultNow(),
    sentAt: tz("sent_at"),
    ...timestamps,
  },
  (t) => [index("email_queue_pending_idx").on(t.status, t.scheduledFor)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    actor: actor("actor").notNull(),
    actorLabel: text("actor_label"),
    invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("activity_wedding_at_idx").on(t.weddingId, t.at), index("activity_invitation_idx").on(t.invitationId)],
);

// Serverless functions share no memory, so rate-limit counters live in the database.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: tz("window_start").notNull(),
  count: integer("count").notNull(),
});

export type Wedding = typeof weddings.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type InvitationRequest = typeof invitationRequests.$inferSelect;
export type PartyMember = typeof partyMembers.$inferSelect;
