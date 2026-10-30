// Module 4: content and settings (U12), always scoped to the admin's wedding.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { contacts, dressCode, programmeItems, venues, weddings } from "@/server/db/schema";
import {
  deleteVenue,
  getSettings,
  saveContact,
  saveFaqItem,
  savePhoto,
  saveProgrammeItem,
  saveVenue,
  setDressCode,
  updateWeddingDetails,
} from "@/server/services/admin/settings";
import { adminCtx } from "../../helpers/admin";
import { createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

async function setup() {
  const wedding = await createWedding(db);
  return { wedding, ctx: await adminCtx(db, wedding.id) };
}

describe("wedding details", () => {
  it("updates names, deadline and settings", async () => {
    const { wedding, ctx } = await setup();
    await updateWeddingDetails(db, ctx, { brideName: "Amani", groomName: "Baraka", rsvpDeadline: "2026-11-20T23:59:59+03:00", dailyEmailCap: 300 });
    const [w] = await db.select().from(weddings).where(eq(weddings.id, wedding.id));
    expect(w).toMatchObject({ brideName: "Amani", groomName: "Baraka", dailyEmailCap: 300 });
    expect(w.rsvpDeadline.toISOString()).toBe("2026-11-20T20:59:59.000Z");
  });

  it("keeps the line break in the story title; an empty title clears it", async () => {
    const { wedding, ctx } = await setup();
    await updateWeddingDetails(db, ctx, { storyTitle: "  Two hearts,\none home ", storyText: "We met." });
    const [w] = await db.select().from(weddings).where(eq(weddings.id, wedding.id));
    expect(w).toMatchObject({ storyTitle: "Two hearts,\none home", storyText: "We met." });
    await updateWeddingDetails(db, ctx, { storyTitle: null });
    const [cleared] = await db.select().from(weddings).where(eq(weddings.id, wedding.id));
    expect(cleared.storyTitle).toBeNull();
  });

  it("D23: moving the wedding date moves the whole programme with it, same times", async () => {
    const { wedding, ctx } = await setup();
    const before = await db.select().from(programmeItems).where(eq(programmeItems.weddingId, wedding.id));
    expect(await updateWeddingDetails(db, ctx, { weddingDate: "2026-12-19" })).toEqual({ programmeShiftedDays: 7 });
    const after = await db.select().from(programmeItems).where(eq(programmeItems.weddingId, wedding.id));
    const byId = new Map(before.map((p) => [p.id, p.startsAt.getTime()]));
    for (const p of after) expect(p.startsAt.getTime() - byId.get(p.id)!).toBe(7 * 86_400_000);
    // Other edits don't move anything.
    expect(await updateWeddingDetails(db, ctx, { brideName: "Neema" })).toEqual({ programmeShiftedDays: 0 });
  });

  it("getSettings returns everything the page needs", async () => {
    const { ctx } = await setup();
    const s = await getSettings(db, ctx);
    expect(s.programme).toHaveLength(12);
    expect(s.venues).toHaveLength(1);
    expect(s.dressCode?.swatches.length).toBeGreaterThan(0);
    expect(s.usherPinSet).toBe(false);
  });

  it("refuses an email cap at Gmail's limit, a bad date, and gates opening after the ceremony", async () => {
    const { ctx } = await setup();
    await expect(updateWeddingDetails(db, ctx, { dailyEmailCap: 500 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateWeddingDetails(db, ctx, { weddingDate: "12/12/2026" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      updateWeddingDetails(db, ctx, { gatesOpenAt: "2026-12-12T14:00:00+03:00", ceremonyStartAt: "2026-12-12T13:00:00+03:00" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("venues and programme", () => {
  it("creates, updates and deletes a venue; programme items keep working when their venue goes", async () => {
    const { wedding, ctx } = await setup();
    const { id } = await saveVenue(db, ctx, { kind: "reception", name: "Garden", lat: -1.3, lng: 36.8 });
    await saveVenue(db, ctx, { id, kind: "reception", name: "Rose Garden", lat: -1.3, lng: 36.8 });
    const { id: itemId } = await saveProgrammeItem(db, ctx, { venueId: id, startsAt: "2026-12-12T16:00:00+03:00", title: "Reception" });
    await deleteVenue(db, ctx, id);
    const [item] = await db.select().from(programmeItems).where(eq(programmeItems.id, itemId));
    expect(item.venueId).toBeNull();
    expect((await db.select().from(venues).where(eq(venues.weddingId, wedding.id))).map((v) => v.name)).toEqual(["Venue to be confirmed"]);
  });

  it("rejects out-of-range coordinates and another wedding's venue", async () => {
    const { ctx } = await setup();
    await expect(saveVenue(db, ctx, { kind: "ceremony", name: "X", lat: 200, lng: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    const other = await setup();
    const { id } = await saveVenue(db, other.ctx, { kind: "ceremony", name: "Theirs" });
    await expect(saveVenue(db, ctx, { id, kind: "ceremony", name: "Hijack" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteVenue(db, ctx, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveProgrammeItem(db, ctx, { venueId: id, startsAt: "2026-12-12T16:00:00+03:00", title: "X" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("other content", () => {
  it("dress code swatches must be hex colours; saving twice updates", async () => {
    const { wedding, ctx } = await setup();
    await expect(setDressCode(db, ctx, { text: "Formal", swatches: [{ name: "Red", hex: "red" }] })).rejects.toMatchObject({ code: "VALIDATION" });
    await setDressCode(db, ctx, { text: "Black tie", swatches: [{ name: "Wine", hex: "#3D0F19" }] });
    const [d] = await db.select().from(dressCode).where(eq(dressCode.weddingId, wedding.id));
    expect(d).toMatchObject({ text: "Black tie", swatches: [{ name: "Wine", hex: "#3D0F19" }] });
  });

  it("contacts get a normalised phone; photos must be /paths or https links; FAQ needs both fields", async () => {
    const { ctx } = await setup();
    const { id } = await saveContact(db, ctx, { role: "MC", name: "MC Name", phone: "0700 000 801" });
    const [c] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(c.phone).toBe("+254700000801");
    await expect(savePhoto(db, ctx, { section: "story", src: "javascript:alert(1)" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(savePhoto(db, ctx, { section: "story", src: "http://insecure.example/x.webp" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(savePhoto(db, ctx, { section: "story", src: "/images/us.webp", alt: "Us" })).resolves.toBeTruthy();
    await expect(saveFaqItem(db, ctx, { question: "Q?", answer: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
