// Module 3: public invitation requests (U11, §5b, D3, E19).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { invitationRequests, invitations, weddings } from "@/server/db/schema";
import { requestInvitation } from "@/server/services/requests";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

let ip = 0;
const nextIp = () => `203.0.113.${++ip}`;

async function setup() {
  const wedding = await createWedding(db);
  const ctx = { weddingSlug: wedding.slug, clientId: nextIp() };
  const requests = () => db.select().from(invitationRequests).where(eq(invitationRequests.weddingId, wedding.id));
  return { wedding, ctx, requests };
}

describe("requestInvitation", () => {
  it("stores a pending request with a normalised phone and a hashed IP, and creates no invitation", async () => {
    const { wedding, ctx, requests } = await setup();
    await expect(
      requestInvitation(db, { fullName: "Asking Guest", phone: "0700 000 333", message: "Friend of the groom" }, ctx),
    ).resolves.toEqual({ ok: true });
    const [r] = await requests();
    expect(r).toMatchObject({ status: "pending", phone: "+254700000333", fullName: "Asking Guest" });
    expect(r.ipHash).toBeTruthy();
    expect(r.ipHash).not.toContain("203.0.113");
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(0);
  });

  it("D3: answers the same when the phone already belongs to an invited guest, and blocks nobody", async () => {
    const { wedding, ctx, requests } = await setup();
    await createInvitation(db, wedding.id, { phone: "+254700000444" });
    await expect(requestInvitation(db, { fullName: "Copycat", phone: "0700000444" }, ctx)).resolves.toEqual({ ok: true });
    expect(await requests()).toHaveLength(1);
  });

  it("needs a name and a phone or email", async () => {
    const { ctx } = await setup();
    await expect(requestInvitation(db, { fullName: "" , phone: "0700000555" }, ctx)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(requestInvitation(db, { fullName: "No Contact" }, { ...ctx, clientId: nextIp() })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      requestInvitation(db, { fullName: "Bad Phone", phone: "12" }, { ...ctx, clientId: nextIp() }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("E19: a filled honeypot looks like success but stores nothing", async () => {
    const { ctx, requests } = await setup();
    await expect(
      requestInvitation(db, { fullName: "Bot", email: "bot@example.com", website: "http://spam.example" }, ctx),
    ).resolves.toEqual({ ok: true });
    expect(await requests()).toHaveLength(0);
  });

  it("E19: rate-limits each client to 3 requests an hour", async () => {
    const { ctx, requests } = await setup();
    const now = new Date("2026-10-20T10:00:00Z");
    for (let i = 0; i < 3; i++) await requestInvitation(db, { fullName: `Person ${i}`, email: `p${i}@example.com` }, { ...ctx, now });
    await expect(
      requestInvitation(db, { fullName: "One too many", email: "p4@example.com" }, { ...ctx, now }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await requests()).toHaveLength(3);
  });

  it("A11: refused when the couple has turned requests off", async () => {
    const { wedding, ctx } = await setup();
    await db.update(weddings).set({ publicRequestsEnabled: false }).where(eq(weddings.id, wedding.id));
    await expect(requestInvitation(db, { fullName: "Late", email: "late@example.com" }, ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
