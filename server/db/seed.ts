// Seed data for one wedding: defaults from BLUEPRINT §11 and the programme from
// PROJECT_SPEC §5. Couple names and venues are placeholders until the content
// checklist (§16) is filled in; edit them in admin settings later.

import { DEFAULT_WHATSAPP_TEMPLATE } from "../utils/whatsapp";
import type { Db } from "./client";
import { adminSettings, contacts, dressCode, faqItems, programmeItems, venues, weddings } from "./schema";

const eat = (dateTime: string) => new Date(`${dateTime}+03:00`); // Africa/Nairobi, no DST

const PROGRAMME: [string, string, string | null][] = [
  ["2026-12-12T11:30", "Arrival & seating", null],
  ["2026-12-12T12:45", "Bridal party arrival", null],
  ["2026-12-12T13:00", "Wedding ceremony", null],
  ["2026-12-12T14:15", "Cocktails & light bites", null],
  ["2026-12-12T15:00", "Photographs", null],
  ["2026-12-12T16:15", "Grand entrance of the couple", null],
  ["2026-12-12T16:30", "Cake cutting", null],
  ["2026-12-12T16:45", "Speeches", null],
  ["2026-12-12T17:00", "Dinner", null],
  ["2026-12-12T18:45", "First dance", null],
  ["2026-12-12T19:00", "Dance & celebrations", null],
  ["2026-12-13T00:45", "Send-off", null],
];

export async function seedWedding(db: Db, slug = "our-wedding") {
  return db.transaction(async (tx) => {
    const [wedding] = await tx
      .insert(weddings)
      .values({
        slug,
        brideName: "Bride", // placeholder
        groomName: "Groom", // placeholder
        weddingDate: "2026-12-12",
        ceremonyStartAt: eat("2026-12-12T13:00"), // A12
        gatesOpenAt: eat("2026-12-12T11:30"), // A12
        rsvpDeadline: eat("2026-11-14T23:59:59"), // A3
        venueCapacity: 300,
        whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
      })
      .returning();

    await tx.insert(adminSettings).values({ weddingId: wedding.id });

    const [venue] = await tx
      .insert(venues)
      .values({ weddingId: wedding.id, kind: "ceremony", name: "Venue to be confirmed" }) // A4
      .returning();

    await tx.insert(programmeItems).values(
      PROGRAMME.map(([at, title, detail], i) => ({
        weddingId: wedding.id,
        venueId: venue.id,
        startsAt: eat(at),
        title,
        detail,
        sortOrder: i,
      })),
    );

    await tx.insert(dressCode).values({
      weddingId: wedding.id,
      text: "Formal. We'd love to see burgundy, gold, champagne, ivory or sage.",
      swatches: [
        { name: "Burgundy", hex: "#5E1F2D" },
        { name: "Gold", hex: "#C9AB66" },
        { name: "Champagne", hex: "#E8D9B5" },
        { name: "Ivory", hex: "#FAF6F2" },
        { name: "Sage", hex: "#9CAF88" },
      ],
    });

    await tx.insert(faqItems).values([
      { weddingId: wedding.id, question: "Can I bring a plus-one?", answer: "Your invitation shows how many guests it includes.", sortOrder: 0 },
      { weddingId: wedding.id, question: "Can I change my response?", answer: "Yes, until the RSVP deadline, using your personal link.", sortOrder: 1 },
    ]);

    await tx.insert(contacts).values([
      { weddingId: wedding.id, role: "MC", name: "To be confirmed", sortOrder: 0 },
      { weddingId: wedding.id, role: "Head usher", name: "To be confirmed", sortOrder: 1 },
    ]);

    return wedding;
  });
}

// `npm run db:seed` runs this file directly against DATABASE_URL. Safe to run twice.
// Wrapped in a function: tsx runs .ts as CommonJS here, so no top-level await.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("server/db/seed.ts")) {
  void (async () => {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is not set. Add it to .env.local (see docs/SETUP.md, step 1).");
      process.exit(1);
    }
    const [{ getDb }, { config }, { eq }] = await Promise.all([import("./client"), import("../config"), import("drizzle-orm")]);
    const db = getDb();
    const slug = config.weddingSlug();
    const [existing] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, slug));
    if (existing) {
      console.log(`✓ Wedding "${slug}" is already seeded. Nothing to do.`);
      process.exit(0);
    }
    try {
      await seedWedding(db, slug);
      console.log(`✓ Seeded wedding "${slug}" with placeholder content. Edit it later in admin settings.`);
      process.exit(0);
    } catch (err) {
      console.error(`✗ Seeding failed: ${(err as Error).message}`);
      process.exit(1);
    }
  })();
}
