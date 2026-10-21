// Link previews (§4a): couple's names, date and an invitation line; never the venue,
// the programme or the guest a link was meant for.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { venues, weddings } from "@/server/db/schema";
import { getShareCard, shareCardFor } from "@/server/services/share";
import { purgeGuestData } from "@/server/services/purge";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("link preview", () => {
  it("shows the couple's names, the date (EAT) and an invitation line", () => {
    expect(shareCardFor({ brideName: "Amina", groomName: "Baraka", weddingDate: "2026-12-19" })).toEqual({
      title: "Amina & Baraka · You're invited",
      description: "Join us as we celebrate our wedding on Saturday, 19 December 2026. Open your personal invitation to RSVP.",
      couple: "Amina & Baraka",
      date: "Saturday, 19 December 2026",
    });
  });

  it("comes from the database and never carries the venue or a guest's name", async () => {
    const wedding = await createWedding(db);
    await createInvitation(db, wedding.id, { fullName: "Wanjiru Kamau", status: "approved" });
    const [venue] = await db.select().from(venues).where(eq(venues.weddingId, wedding.id));
    const card = await getShareCard(db, wedding.slug);
    expect(card?.couple).toBe(`${wedding.brideName} & ${wedding.groomName}`);
    const text = JSON.stringify(card);
    expect(text).not.toContain("Wanjiru");
    if (venue) expect(text).not.toContain(venue.name);
  });

  it("is null for an unknown or purged wedding, so pages fall back to a generic card", async () => {
    expect(await getShareCard(db, "no-such-wedding")).toBeNull();
    const wedding = await createWedding(db);
    await purgeGuestData(db, wedding.id, { actor: "system" });
    expect((await db.select().from(weddings).where(eq(weddings.id, wedding.id)))[0].purgedAt).not.toBeNull();
    expect(await getShareCard(db, wedding.slug)).toBeNull();
  });
});
