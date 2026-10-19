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

/** Parses or throws VALIDATION with field-level messages for the form. */
export function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fields = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  throw new AppError("VALIDATION", fields[0]?.message ?? "Please check the form.", { fields });
}
