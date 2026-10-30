// Module 3: guest pages and view tracking (PROJECT_SPEC §4a, BR-1 to BR-4, U3, E27).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, invitations, venues } from "@/server/db/schema";
import { requireApproved } from "@/server/services/access";
import { getInvitationPage, getPublicTeaser, recordView } from "@/server/services/invitation-page";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-10-20T10:00:00+03:00");
/** D29: the wedding content is public, but a page for a guest who isn't approved never carries a pass. */
function expectNoPass(page: unknown) {
  expect(JSON.stringify(page)).not.toMatch(/qrSvg|passVersion|"pass"/);
}

describe("public teaser", () => {
  it("shows names, date and countdown only", async () => {
    const wedding = await createWedding(db);
    await db.update(venues).set({ lat: -1.2921, lng: 36.8219, address: "Secret Road" }).where(eq(venues.weddingId, wedding.id));
    const teaser = await getPublicTeaser(db, wedding.slug);
    expect(Object.keys(teaser).sort()).toEqual(
      ["acceptsRequests", "brideName", "ceremonyStartAt", "groomName", "hashtag", "monogram", "timezone", "weddingDate"].sort(),
    );
    expect(JSON.stringify(teaser)).not.toContain("Secret Road");
  });

  it("is not found for an unknown wedding", async () => {
    await expect(getPublicTeaser(db, "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("§4a: what each access level receives", () => {
  it("invited (including said Yes, awaiting approval) gets their card, RSVP and the content (D29), no pass", async () => {
    const wedding = await createWedding(db);
    for (const status of ["draft", "sent", "viewed", "awaiting_approval"] as const) {
      const { token } = await createInvitation(db, wedding.id, { status, fullName: "Wanjiru Kamau", seatAllowance: 2 });
      const page = await getInvitationPage(db, token, { now: NOW });
      expect(page.level).toBe("invited");
      if (page.level !== "invited") throw new Error("unreachable");
      expect(page.guest).toMatchObject({ firstName: "Wanjiru", seatAllowance: 2, awaitingApproval: status === "awaiting_approval" });
      expect(page.rsvp.open).toBe(true);
      expect(page.content.programme.length).toBeGreaterThan(0); // D29
      expectNoPass(page);
    }
  });

  it("E2: says whether contact details are on file, but never sends them (forwarded links)", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "sent", phone: "+254700000971", email: "private@example.com" });
    const page = await getInvitationPage(db, token, { now: NOW });
    if (page.level !== "invited") throw new Error("unreachable");
    expect(page.guest).toMatchObject({ hasEmail: true, hasPhone: true });
    expect(JSON.stringify(page)).not.toMatch(/254700000971|private@example\.com/);
    expect(page.rsvp.weddingEvents).toEqual(["ceremony"]); // D9: from the wedding's venues
  });

  it("declined gets their card, form (to change to Yes) and the content (D29), no pass", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "declined", respondedAt: NOW });
    const page = await getInvitationPage(db, token, { now: NOW });
    expect(page.level).toBe("declined");
    if (page.level !== "declined") throw new Error("unreachable");
    expect(page.content.venues.length).toBeGreaterThan(0); // D29
    expectNoPass(page);
  });

  it("not approved gets a neutral page with their first name only", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "not_approved", fullName: "Otieno Ouma" });
    const page = await getInvitationPage(db, token);
    expect(page).toEqual({ level: "not_approved", teaser: expect.any(Object), guest: { firstName: "Otieno" } });
  });

  it("revoked gets nothing at all, not even their name", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "revoked", fullName: "Akinyi Atieno" });
    expect(await getInvitationPage(db, token)).toEqual({ level: "revoked" });
  });

  it("public / unknown tokens get nothing", async () => {
    expect(await getInvitationPage(db, undefined)).toEqual({ level: "public" });
    expect(await getInvitationPage(db, "x".repeat(43))).toEqual({ level: "public" });
  });

  it("approved gets the full content, with directions when coordinates are set", async () => {
    const wedding = await createWedding(db);
    await db.update(venues).set({ lat: -1.2921, lng: 36.8219 }).where(eq(venues.weddingId, wedding.id));
    for (const status of ["approved", "partially_arrived", "arrived"] as const) {
      const { token } = await createInvitation(db, wedding.id, { status, respondedAt: NOW });
      const page = await getInvitationPage(db, token, { now: NOW });
      expect(page.level).toBe("approved");
      if (page.level !== "approved") throw new Error("unreachable");
      expect(page.content?.programme).toHaveLength(12);
      expect(page.content?.venues[0].directionsUrl).toBe("https://www.google.com/maps/dir/?api=1&destination=-1.2921,36.8219");
      expect(page.content?.dressCode?.swatches.length).toBeGreaterThan(0);
    }
  });

  it("the same guest loses the content the moment they are revoked (BR-3)", async () => {
    const wedding = await createWedding(db);
    const { invitation, token } = await createInvitation(db, wedding.id, { status: "approved" });
    expect((await getInvitationPage(db, token)).level).toBe("approved");
    await db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, invitation.id));
    expect(await getInvitationPage(db, token)).toEqual({ level: "revoked" });
  });

  it("BR-1 (since D29: the gate pass): proof of approval is refused before approval", async () => {
    const wedding = await createWedding(db);
    const { token } = await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    await expect(requireApproved(db, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("U3 / E27: recording views", () => {
  async function setup(status: "draft" | "sent" | "approved" | "revoked" = "sent") {
    const wedding = await createWedding(db);
    const { invitation, token } = await createInvitation(db, wedding.id, { status });
    const reload = async () => (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0];
    return { invitation, token, reload };
  }

  it("the first guest view moves sent → viewed and records the time; later views update the count", async () => {
    const { token, reload, invitation } = await setup();
    const t1 = new Date("2026-10-20T09:00:00Z");
    const t2 = new Date("2026-10-21T09:00:00Z");
    await recordView(db, token, { viewer: "guest", now: t1 });
    await recordView(db, token, { viewer: "guest", now: t2 });
    const inv = await reload();
    expect(inv).toMatchObject({ status: "viewed", firstViewedAt: t1, lastViewedAt: t2, viewCount: 2 });
    const logs = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(logs.map((l) => l.action)).toEqual(["viewed"]); // first view only
  });

  it("a draft opened via a manually shared link counts as viewed", async () => {
    const { token, reload } = await setup("draft");
    await recordView(db, token, { viewer: "guest" });
    expect((await reload()).status).toBe("viewed");
  });

  it("E27: the couple opening the link is not counted", async () => {
    const { token, reload } = await setup();
    await recordView(db, token, { viewer: "admin" });
    expect(await reload()).toMatchObject({ status: "sent", viewCount: 0, firstViewedAt: null });
  });

  it("later states are not changed by a view", async () => {
    for (const status of ["approved", "revoked"] as const) {
      const { token, reload } = await setup(status);
      await recordView(db, token, { viewer: "guest" });
      expect(await reload()).toMatchObject({ status, viewCount: 1 });
    }
  });

  it("unknown tokens record nothing", async () => {
    await expect(recordView(db, "x".repeat(43), { viewer: "guest" })).resolves.toBeUndefined();
  });
});
