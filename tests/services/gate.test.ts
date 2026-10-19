// Module 6: gate pass and check-in (§9, BR-13 to BR-16, E3, E4, E5, E17, E18, E23).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { signPassToken } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
import { activityLog, checkIns, invitations, partyMembers } from "@/server/db/schema";
import { admit, getGatePass, getGateRoster, passTokenFor, scanUrl, searchAtGate, syncOfflineCheckIns, verifyScan } from "@/server/services/gate";
import { usherLogin } from "@/server/services/gate-login";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";
import { usherFor } from "../helpers/usher";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const ON_THE_DAY = new Date("2026-12-12T12:00:00+03:00");
const opts = { now: ON_THE_DAY };

async function setup(values: Parameters<typeof createInvitation>[2] = {}) {
  const wedding = await createWedding(db);
  const usher = await usherFor(db, wedding.id);
  const { invitation, token } = await createInvitation(db, wedding.id, { status: "approved", partySize: 3, fullName: "Wanjiru Kamau", phone: "+254700000961", email: "w@example.com", ...values });
  const pass = scanUrl(await passTokenFor(invitation));
  const reload = async () => (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0];
  return { wedding, usher, invitation, token, pass, reload };
}

describe("gate pass page", () => {
  it("approved guests get a QR of the scan URL; first view is recorded once", async () => {
    const { token, reload } = await setup();
    const t1 = new Date("2026-12-01T10:00:00Z");
    const pass = await getGatePass(db, token, { now: t1 });
    expect(pass).toMatchObject({ guestName: "Wanjiru Kamau", partySize: 3, arrivedCount: 0, weddingDate: "2026-12-12" });
    expect(pass.scanUrl).toMatch(/^https:\/\/wedding\.test\/scan\/v\/[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(pass.qrSvg).toMatch(/^<svg/);
    await getGatePass(db, token, { now: new Date("2026-12-02T10:00:00Z") });
    expect((await reload()).passFirstViewedAt).toEqual(t1);
  });

  it("BR-1: nobody else gets a pass", async () => {
    for (const status of ["sent", "awaiting_approval", "declined", "not_approved", "revoked"] as const) {
      const { token } = await setup({ status });
      await expect(getGatePass(db, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("BR-13: verifying a scan", () => {
  it("a valid pass shows name and party size only, from the URL or the bare token", async () => {
    const { usher, pass, invitation } = await setup();
    const res = await verifyScan(db, usher, pass, opts);
    expect(res).toEqual({ result: "ok", invitationId: invitation.id, name: "Wanjiru Kamau", partySize: 3, arrivedCount: 0, remaining: 3 });
    expect(JSON.stringify(res)).not.toMatch(/254700000961|w@example\.com/); // no contact details at the gate
    expect((await verifyScan(db, usher, pass.split("/scan/v/")[1], opts)).result).toBe("ok");
  });

  it("revoked passes are refused (BR-3)", async () => {
    const { usher, pass, invitation } = await setup();
    await db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, invitation.id));
    expect(await verifyScan(db, usher, pass, opts)).toEqual({ result: "revoked", name: "Wanjiru Kamau" });
  });

  it("E6/E22: an old pass version (screenshot from before a change) is refused", async () => {
    const { usher, pass, invitation } = await setup();
    await db.update(invitations).set({ passVersion: 2 }).where(eq(invitations.id, invitation.id));
    expect((await verifyScan(db, usher, pass, opts)).result).toBe("outdated");
  });

  it("guests not (or no longer) approved are refused", async () => {
    const { usher, pass, invitation } = await setup();
    await db.update(invitations).set({ status: "awaiting_approval" }).where(eq(invitations.id, invitation.id));
    expect((await verifyScan(db, usher, pass, opts)).result).toBe("not_approved");
  });

  it("garbage, forged and other weddings' passes are all just 'invalid'", async () => {
    const { usher, invitation } = await setup();
    const other = await setup();
    const forged = (await signPassToken({ invitationId: invitation.id, weddingId: invitation.weddingId, passVersion: 1 })).slice(0, -4) + "AAAA";
    for (const scanned of ["", "hello", "https://evil.example/scan/v/abc", forged, other.pass]) {
      expect(await verifyScan(db, usher, scanned, opts)).toEqual({ result: "invalid" });
    }
  });

  it("E23: passes stop working after the wedding (send-off after midnight still works)", async () => {
    const { usher, pass } = await setup();
    expect((await verifyScan(db, usher, pass, { now: new Date("2026-12-13T01:30:00+03:00") })).result).toBe("ok");
    expect(await verifyScan(db, usher, pass, { now: new Date("2026-12-14T00:30:00+03:00") })).toEqual({ result: "expired" });
  });
});

describe("BR-14/15/16: admitting", () => {
  it("2 of 3 now, the last one later; a third scan shows who admitted them and when (E3)", async () => {
    const { usher, pass, invitation, reload } = await setup();
    expect(await admit(db, usher, { scanned: pass }, 2, opts)).toMatchObject({ result: "admitted", arrivedCount: 2, remaining: 1 });
    expect((await reload()).status).toBe("partially_arrived");
    expect(await admit(db, usher, { scanned: pass }, 1, opts)).toMatchObject({ result: "admitted", arrivedCount: 3, remaining: 0 });
    expect((await reload()).status).toBe("arrived");

    const again = await verifyScan(db, usher, pass, opts);
    expect(again).toMatchObject({ result: "already_admitted", arrivedCount: 3, lastBy: "Gate 1" });
    expect(await admit(db, usher, { scanned: pass }, 1, opts)).toMatchObject({ result: "already_admitted" });

    const rows = await db.select().from(checkIns).where(eq(checkIns.invitationId, invitation.id));
    expect(rows.map((r) => [r.count, r.method, r.usherDevice])).toEqual([[2, "scan", "Gate 1"], [1, "scan", "Gate 1"]]);
    const logs = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(logs.map((l) => [l.actor, l.actorLabel, l.action])).toEqual([["usher", "Gate 1", "admit"], ["usher", "Gate 1", "admit"]]);
  });

  it("can't admit more than are left", async () => {
    const { usher, pass } = await setup();
    await admit(db, usher, { scanned: pass }, 2, opts);
    await expect(admit(db, usher, { scanned: pass }, 2, opts)).rejects.toMatchObject({ code: "VALIDATION", details: { remaining: 1 } });
    await expect(admit(db, usher, { scanned: pass }, 0, opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("E5: two ushers scanning the same pass at the same moment never over-admit", async () => {
    const { wedding, pass, reload } = await setup();
    const gate1 = await usherFor(db, wedding.id, "Gate 1");
    const gate2 = await usherFor(db, wedding.id, "Gate 2");
    const results = await Promise.allSettled([admit(db, gate1, { scanned: pass }, 2, opts), admit(db, gate2, { scanned: pass }, 2, opts)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await reload()).arrivedCount).toBe(2);
  });

  it("E18: manual admit by name for a guest without a phone; not for unapproved or other weddings' guests", async () => {
    const { wedding, usher, invitation } = await setup();
    expect(await admit(db, usher, { invitationId: invitation.id }, 3, opts)).toMatchObject({ result: "admitted", remaining: 0 });
    const [row] = await db.select().from(checkIns).where(eq(checkIns.invitationId, invitation.id));
    expect(row.method).toBe("manual");

    const pending = await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    expect((await admit(db, usher, { invitationId: pending.invitation.id }, 1, opts)).result).toBe("not_approved");
    const other = await setup();
    expect(await admit(db, usher, { invitationId: other.invitation.id }, 1, opts)).toEqual({ result: "invalid" });
  });
});

describe("E18: name search at the gate", () => {
  it("finds approved guests by their own or a party member's name, without contact details", async () => {
    const { wedding, usher, invitation } = await setup();
    await db.insert(partyMembers).values([
      { invitationId: invitation.id, fullName: "Wanjiru Kamau", isPrimary: true },
      { invitationId: invitation.id, fullName: "Otieno Ouma", sortOrder: 1 },
    ]);
    await createInvitation(db, wedding.id, { status: "awaiting_approval", fullName: "Wanjiku Pending" });
    await createInvitation(db, wedding.id, { status: "revoked", fullName: "Wanjala Revoked" });

    const byGuest = await searchAtGate(db, usher, "wanj");
    expect(byGuest).toEqual([{ invitationId: invitation.id, name: "Wanjiru Kamau", partySize: 3, arrivedCount: 0, members: ["Wanjiru Kamau", "Otieno Ouma"] }]);
    expect((await searchAtGate(db, usher, "otieno")).map((r) => r.name)).toEqual(["Wanjiru Kamau"]);
    expect(await searchAtGate(db, usher, "w")).toEqual([]);
    expect(await searchAtGate(db, usher, "%")).toEqual([]);
  });
});

describe("N3/E17: offline roster and sync", () => {
  it("the roster lists approved guests only, with pass versions", async () => {
    const { wedding, usher, invitation } = await setup();
    await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    const roster = await getGateRoster(db, usher, opts);
    expect(roster.syncedAt).toEqual(ON_THE_DAY);
    expect(roster.guests).toEqual([{ invitationId: invitation.id, passVersion: 1, name: "Wanjiru Kamau", partySize: 3, arrivedCount: 0 }]);
  });

  it("applies each offline check-in once, keeps its time, and flags conflicts for the couple", async () => {
    const { wedding, usher, invitation } = await setup();
    const revoked = await createInvitation(db, wedding.id, { status: "revoked" });
    const at = new Date("2026-12-12T11:45:00+03:00");
    const entries = [
      { clientRef: "gate1-0001", invitationId: invitation.id, passVersion: 1, count: 2, at: at.toISOString() },
      { clientRef: "gate1-0002", invitationId: invitation.id, passVersion: 1, count: 2, at: at.toISOString() },
      { clientRef: "gate1-0003", invitationId: revoked.invitation.id, count: 1, at: at.toISOString() },
    ];
    expect(await syncOfflineCheckIns(db, usher, entries, opts)).toEqual([
      { clientRef: "gate1-0001", outcome: "applied" },
      { clientRef: "gate1-0002", outcome: "applied_partially", reason: "More people than the party size." },
      { clientRef: "gate1-0003", outcome: "rejected", reason: "revoked" },
    ]);
    // Re-sending the same batch (flaky signal) changes nothing.
    expect((await syncOfflineCheckIns(db, usher, entries.slice(0, 2), opts)).map((r) => r.outcome)).toEqual(["duplicate", "duplicate"]);

    const rows = await db.select().from(checkIns).where(eq(checkIns.invitationId, invitation.id));
    expect(rows.map((r) => [r.count, r.method, r.at.toISOString()])).toEqual([
      [2, "offline_sync", at.toISOString()],
      [1, "offline_sync", at.toISOString()],
    ]);
    const conflicts = (await db.select().from(activityLog).where(eq(activityLog.weddingId, wedding.id))).filter((l) => l.action === "offline_checkin_conflict");
    expect(conflicts).toHaveLength(2);
  });

  it("rejects malformed batches", async () => {
    const { usher } = await setup();
    await expect(syncOfflineCheckIns(db, usher, [{ clientRef: "x", invitationId: "nope", count: 1, at: "soon" }], opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("usher PIN login", () => {
  it("right PIN → session; wrong PIN refused; 10 attempts per 15 minutes", async () => {
    const { wedding } = await setup();
    const ctx = { weddingSlug: wedding.slug, clientId: "203.0.113.50", now: ON_THE_DAY };
    await expect(usherLogin(db, { pin: "4821", device: "Gate 2" }, ctx)).resolves.toMatch(/\./);
    await expect(usherLogin(db, { pin: "0000", device: "Gate 2" }, ctx)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    for (let i = 0; i < 8; i++) await usherLogin(db, { pin: "0000", device: "X" }, ctx).catch(() => {});
    await expect(usherLogin(db, { pin: "4821", device: "Gate 2" }, ctx)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
