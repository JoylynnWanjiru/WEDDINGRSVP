// Zod schemas for every form and API body. Services parse raw input with
// parseInput(), so validation happens on the server whatever the browser checked.

import { z } from "zod";
import { AppError } from "../errors";

export const DIETARY = ["none", "vegetarian", "vegan", "halal", "gluten_free", "other"] as const;
export const EVENT_KINDS = ["ceremony", "reception", "traditional"] as const;

const fullName = z.string().trim().min(1, "Please enter a full name.").max(120, "That name is too long.");

/** Optional free text: blank strings become undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => v || undefined);

const optionalEmail = optionalText(200).refine((v) => v === undefined || z.email().safeParse(v).success, {
  message: "Please enter a valid email address.",
});

const partyMember = z.object({
  fullName, // BR-6
  isChild: z.boolean().default(false),
  dietary: z.enum(DIETARY).default("none"),
  dietaryNotes: optionalText(300),
});

const contact = {
  email: optionalEmail,
  phone: optionalText(30),
  message: optionalText(1000),
};

export const rsvpInput = z.discriminatedUnion("attending", [
  z.object({
    attending: z.literal(true),
    primary: partyMember.omit({ isChild: true }),
    extras: z.array(partyMember).max(20).default([]),
    /** Events the party will attend. Omitted = all of the wedding's events. */
    events: z.array(z.enum(EVENT_KINDS)).max(EVENT_KINDS.length).optional(),
    ...contact,
  }),
  z.object({ attending: z.literal(false), ...contact }),
]);

export type RsvpInput = z.infer<typeof rsvpInput>;

export const requestInput = z
  .object({
    fullName,
    phone: optionalText(30),
    email: optionalEmail,
    message: optionalText(1000),
    /** Honeypot (E19): hidden from people, filled in by bots. */
    website: z.string().optional(),
  })
  .refine((v) => v.phone || v.email, { message: "Please give a phone number or an email address.", path: ["phone"] });

export type RequestInput = z.infer<typeof requestInput>;

// --- admin ---

export const SIDES = ["bride", "groom", "both"] as const;

const seatAllowance = z.coerce.number().int().min(0, "Seat allowance can't be negative.").max(20);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const invitationInput = z.object({
  fullName,
  phone: optionalText(30),
  email: optionalEmail,
  group: optionalText(60),
  side: z.enum(SIDES).optional(),
  seatAllowance: seatAllowance.optional(),
  notes: optionalText(1000),
});

/** Edit form: every field optional; null clears it. */
export const invitationPatch = z.object({
  fullName: fullName.optional(),
  phone: nullableText(30),
  email: nullableText(200).refine((v) => v == null || z.email().safeParse(v).success, {
    message: "Please enter a valid email address.",
  }),
  group: nullableText(60),
  side: z.enum(SIDES).nullable().optional(),
  seatAllowance: seatAllowance.optional(),
  notes: nullableText(1000),
});

const isoDate = z.coerce.date({ message: "Please enter a valid date and time." });

// --- admins (D26) ---

export const adminInput = z.object({
  name: z.string().trim().min(1, "Please enter their name.").max(80, "That name is too long."),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Please enter a valid email address.")),
});

// --- vendors (D25) ---

const staffCount = z.coerce.number().int().min(1, "A team has at least 1 person.").max(50, "At most 50 people per team.");
const mealCount = z.coerce.number().int().min(0, "Meals can't be negative.").max(50, "At most 50 meals per team.");

export const vendorInput = z.object({
  company: z.string().trim().min(1, "Please enter the company or vendor name.").max(120),
  role: z.string().trim().min(1, "Please enter what they do, e.g. Photographer.").max(60),
  contactName: optionalText(120),
  phone: optionalText(30),
  email: optionalEmail,
  staffCount,
  mealCount: mealCount.optional(), // defaults to the staff count
  arriveAt: isoDate.optional(),
  instructions: optionalText(2000),
  notes: optionalText(1000),
});

/** Edit form: every field optional; null clears it. */
export const vendorPatch = z.object({
  company: vendorInput.shape.company.optional(),
  role: vendorInput.shape.role.optional(),
  contactName: nullableText(120),
  phone: nullableText(30),
  email: nullableText(200).refine((v) => v == null || z.email().safeParse(v).success, {
    message: "Please enter a valid email address.",
  }),
  staffCount: staffCount.optional(),
  mealCount: mealCount.optional(),
  arriveAt: isoDate.nullable().optional(),
  instructions: nullableText(2000),
  notes: nullableText(1000),
});

export const weddingPatch = z
  .object({
    brideName: fullName,
    groomName: fullName,
    monogram: nullableText(10),
    weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD."),
    ceremonyStartAt: isoDate,
    gatesOpenAt: isoDate,
    rsvpDeadline: isoDate,
    venueCapacity: z.coerce.number().int().min(1).max(100_000).nullable(),
    storyTitle: nullableText(80),
    storyText: nullableText(10_000),
    hashtag: nullableText(60),
    whatsappTemplate: nullableText(1000),
    contributionInfo: z.record(z.string(), z.string().max(200)).nullable(),
    defaultSeatAllowance: seatAllowance,
    dailyEmailCap: z.coerce.number().int().min(0).max(450, "Stay below Gmail's ~500/day limit (BR-17)."),
    reminderIntervalDays: z.coerce.number().int().min(1).max(30),
    purgeAfterDays: z.coerce.number().int().min(1).max(365),
    requirePhoneCheck: z.boolean(),
    publicRequestsEnabled: z.boolean(),
    autoApprove: z.boolean(),
  })
  .partial();

const sortOrder = z.coerce.number().int().min(0).max(10_000).default(0);
const id = z.uuid().optional();

export const venueInput = z.object({
  id,
  kind: z.enum(EVENT_KINDS),
  name: z.string().trim().min(1).max(200),
  address: nullableText(500),
  landmarks: nullableText(1000),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  parkingNotes: nullableText(1000),
  mapImageUrl: nullableText(500),
  sortOrder,
});

export const programmeInput = z.object({
  id,
  venueId: z.uuid().nullable().optional(),
  startsAt: isoDate,
  title: z.string().trim().min(1).max(200),
  detail: nullableText(1000),
  sortOrder,
});

export const faqInput = z.object({
  id,
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(3000),
  sortOrder,
});

export const contactInput = z.object({
  id,
  role: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  phone: nullableText(30),
  sortOrder,
});

export const dressCodeInput = z.object({
  text: z.string().trim().min(1).max(3000),
  swatches: z
    .array(z.object({ name: z.string().trim().min(1).max(40), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #5E1F2D.") }))
    .max(12),
});

export const photoInput = z.object({
  id,
  section: z.string().trim().min(1).max(40),
  // Local /public paths or https URLs only.
  src: z.string().trim().max(500).regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, "Use a /path or an https:// link."),
  alt: z.string().trim().max(200).default(""),
  sortOrder,
});

/** Parses or throws VALIDATION with field-level messages for the form. */
export function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  throw new AppError("VALIDATION", fields[0]?.message ?? "Please check the form.", { fields });
}
