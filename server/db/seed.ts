// Seed data for one wedding: defaults from BLUEPRINT §11 and the programme from
// PROJECT_SPEC §5. Couple names and venues are placeholders until the content
// checklist (§16) is filled in; edit them in admin settings later.

import { DEFAULT_WHATSAPP_TEMPLATE } from "../utils/whatsapp";
import type { Db } from "./client";
import { adminSettings, contacts, dressCode, faqItems, programmeItems, venues, weddings } from "./schema";

const eat = (dateTime: string) => new Date(`${dateTime}+03:00`); // Africa/Nairobi, no DST

const PROGRAMME: [string, string, string | null][] = [
  ["2026-12-12T11:30", "Gates open & arrival", "Present your gate pass QR at the gate; ushers guide seating"],
  ["2026-12-12T12:00", "Welcome & seating", "Guests seated; family seated in reserved rows"],
  ["2026-12-12T12:45", "Bridal party arrival", "Please be seated and silence phones"],
  ["2026-12-12T13:00", "Ceremony begins", "Processional, hymns, readings, sermon"],
  ["2026-12-12T13:40", "Vows & exchange of rings", null],
  ["2026-12-12T13:55", "Signing of the register", "Special music / choir"],
  ["2026-12-12T14:10", "Recessional", "Couple exits; guests follow ushers' directions"],
  ["2026-12-12T14:15", "Cocktails & light bites", "Guests move to the cocktail area"],
  ["2026-12-12T15:00", "Photographs", "Family, bridal party, then guest groups"],
  ["2026-12-12T16:00", "Reception: guests seated", "Find your table on the seating board"],
  ["2026-12-12T16:15", "Grand entrance of the couple", null],
  ["2026-12-12T16:30", "Cake cutting", null],
  ["2026-12-12T16:45", "Speeches & family introductions", "MC, parents, best man, maid of honour"],
  ["2026-12-12T17:00", "Dinner", "Dietary meals marked"],
  ["2026-12-12T18:15", "Gifts & well-wishes", null],
  ["2026-12-12T18:45", "First dance", "Then the floor opens"],
  ["2026-12-12T19:00", "Party", null],
  ["2026-12-13T00:45", "Last dance & send-off", null],
  ["2026-12-13T01:00", "Farewells", "Safe travels home"],
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

// `npm run db:seed` runs this file directly against DATABASE_URL.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("server/db/seed.ts")) {
  const { getDb } = await import("./client");
  const wedding = await seedWedding(getDb());
  console.log(`Seeded wedding ${wedding.slug} (${wedding.id})`);
  process.exit(0);
}
