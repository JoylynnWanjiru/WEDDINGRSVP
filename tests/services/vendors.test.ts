// Vendors (D25): the admin list, the vendor's own page, vendor passes at the gate,
// dashboard and export lines, and deletion with guest data (BR-23).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { verifyPassToken, vendorTokenFor } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
import { activityLog, vendorCheckIns, vendors } from "@/server/db/schema";
import { getDashboard } from "@/server/services/admin/dashboard";
import { exportCsv } from "@/server/services/admin/exports";
import { addVendor, getVendorWhatsapp, listVendors, newVendorLink, removeVendor, restoreVendor, updateVendor } from "@/server/services/admin/vendors";
import { getAccess } from "@/server/services/access";
import { admit, getGateRoster, scanUrl, searchAtGate, syncOfflineCheckIns, vendorPassTokenFor, verifyScan } from "@/server/services/gate";
import { purgeGuestData } from "@/server/services/purge";
import { getVendorPage } from "@/server/services/vendor-page";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";
import { adminCtx } from "../helpers/admin";
import { usherFor } from "../helpers/usher";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const ON_THE_DAY = new Date("2026-12-12T12:00:00+03:00");
const opts = { now: ON_THE_DAY };
const PHOTOGRAPHER = { company: "Lens Studio", role: "Photographer", contactName: "Achieng Otieno", phone: "0700000881", email: "lens@example.com", staffCount: 3, instructions: "Use the back gate.", notes: "Paid deposit" };

async function setup(input: Record<string, unknown> = PHOTOGRAPHER) {
  const wedding = await createWedding(db);
  const ctx = await adminCtx(wedding.id);
  const { id } = await addVendor(db, ctx, input);
  const reload = async () => (await db.select().from(vendors).where(eq(vendors.id, id)))[0];
  const pass = async () => scanUrl(await vendorPassTokenFor(await reload()));
  const token = () => reload().then((v) => vendorTokenFor(v.id, v.linkVersion));
  return { wedding, ctx, id, reload, pass, token };
}

describe("admin vendor list", () => {
  it("adds a vendor: phone normalised (BR-20), meals default to the staff count", async () => {
    const { reload } = await setup();
    expect(await reload()).toMatchObject({ company: "Lens Studio", phone: "+254700000881", staffCount: 3, mealCount: 3, arrivedCount: 0, removedAt: null });
  });

  it("validates input", async () => {
    const { ctx } = await setup();
    await expect(addVendor(db, ctx, { ...PHOTOGRAPHER, company: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addVendor(db, ctx, { ...PHOTOGRAPHER, phone: "12" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addVendor(db, ctx, { ...PHOTOGRAPHER, staffCount: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addVendor(db, ctx, { ...PHOTOGRAPHER, email: "not-an-email" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists only this wedding's vendors, with a link while active", async () => {
    const a = await setup();
    await setup({ ...PHOTOGRAPHER, company: "Other Wedding Co" });
    const list = await listVendors(db, a.ctx);
    expect(list.map((v) => v.company)).toEqual(["Lens Studio"]);
    expect(list[0].link).toMatch(/^https:\/\/wedding\.test\/vendor\/[\w-]{43}$/);
  });

  it("another wedding's admin can't touch the vendor", async () => {
    const a = await setup();
    const b = await setup();
    await expect(removeVendor(db, b.ctx, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getVendorWhatsapp(db, b.ctx, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("E21: a stale edit is refused; the team can't shrink below those already inside", async () => {
    const { ctx, id, reload, pass, wedding } = await setup();
    const loaded = (await reload()).updatedAt;
    await updateVendor(db, ctx, id, { mealCount: 2 }, loaded);
    await expect(updateVendor(db, ctx, id, { mealCount: 1 }, loaded)).rejects.toMatchObject({ code: "CONFLICT" });

    await admit(db, await usherFor(db, wedding.id), { scanned: await pass() }, 2, opts);
    await expect(updateVendor(db, ctx, id, { staffCount: 1 }, (await reload()).updatedAt)).rejects.toMatchObject({ code: "VALIDATION" });
    await updateVendor(db, ctx, id, { staffCount: 2, phone: null }, (await reload()).updatedAt);
    expect(await reload()).toMatchObject({ staffCount: 2, phone: null, mealCount: 2 });
  });

  it("WhatsApp share carries the vendor link; not for a vendor without a phone or removed", async () => {
    const { ctx, id } = await setup();
    const share = await getVendorWhatsapp(db, ctx, id);
    expect(share.url).toMatch(/^https:\/\/wa\.me\/254700000881\?text=/);
    expect(share.message).toContain("Hello Achieng!");
    expect(share.message).toMatch(/\/vendor\/[\w-]{43}/);

    const noPhone = await addVendor(db, ctx, { company: "DJ Beats", role: "DJ", staffCount: 1 });
    await expect(getVendorWhatsapp(db, ctx, noPhone.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await removeVendor(db, ctx, id);
    await expect(getVendorWhatsapp(db, ctx, id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("every change is in the activity log against the vendor, with no personal data", async () => {
    const { ctx, id, reload } = await setup();
    await updateVendor(db, ctx, id, { phone: "0700000882" }, (await reload()).updatedAt);
    await removeVendor(db, ctx, id);
    await restoreVendor(db, ctx, id);
    const logs = await db.select().from(activityLog).where(eq(activityLog.vendorId, id)).orderBy(activityLog.at);
    expect(logs.map((l) => l.action)).toEqual(["vendor_added", "vendor_edited", "vendor_removed", "vendor_restored"]);
    expect(JSON.stringify(logs.map((l) => l.meta))).not.toContain("0700000882");
  });
});

describe("the vendor's own page (D25: working info only)", () => {
  it("shows arrival, instructions, programme, venues, contacts and the pass; nothing guest-only", async () => {
    const { token } = await setup();
    const page = await getVendorPage(db, await token());
    expect(Object.keys(page).sort()).toEqual(["contacts", "gatesOpenAt", "pass", "programme", "vendor", "venues", "wedding"]);
    expect(page.vendor).toEqual({
      company: "Lens Studio",
      role: "Photographer",
      contactName: "Achieng Otieno",
      staffCount: 3,
      mealCount: 3,
      arriveAt: null,
      instructions: "Use the back gate.",
    }); // never the couple's private notes
    expect(page.programme.length).toBeGreaterThan(0);
    expect(page.pass.qrSvg).toMatch(/^<svg/);
    expect(JSON.stringify(page)).not.toContain("Paid deposit");
  });

  it("BR-4: an unknown, malformed or removed vendor's link gets nothing", async () => {
    const { ctx, id, token } = await setup();
    const t = await token();
    await expect(getVendorPage(db, "x".repeat(43))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getVendorPage(db, "../etc")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await removeVendor(db, ctx, id);
    await expect(getVendorPage(db, t)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await restoreVendor(db, ctx, id);
    expect((await getVendorPage(db, t)).vendor.company).toBe("Lens Studio");
  });

  it("a new link stops the old one", async () => {
    const { ctx, id, token } = await setup();
    const old = await token();
    const link = await newVendorLink(db, ctx, id);
    await expect(getVendorPage(db, old)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getVendorPage(db, link.split("/vendor/")[1])).vendor.company).toBe("Lens Studio");
  });

  it("vendor and guest links never open each other's pages", async () => {
    const { wedding, token } = await setup();
    const guest = await createInvitation(db, wedding.id, { status: "approved" });
    expect((await getAccess(db, await token())).level).toBe("public");
    await expect(getVendorPage(db, guest.token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("vendor passes at the gate (BR-13 to BR-16)", () => {
  it("the usher sees vendor, role, company and staff; admitting part of the team works", async () => {
    const { wedding, id, pass, reload } = await setup();
    const usher = await usherFor(db, wedding.id);
    expect(await verifyScan(db, usher, await pass(), opts)).toEqual({ result: "ok", vendorId: id, name: "Lens Studio", role: "Photographer", partySize: 3, arrivedCount: 0, remaining: 3 });
    expect(await admit(db, usher, { scanned: await pass() }, 2, opts)).toMatchObject({ result: "admitted", vendorId: id, arrivedCount: 2, remaining: 1 });
    expect(await admit(db, usher, { vendorId: id }, 1, opts)).toMatchObject({ result: "admitted", remaining: 0 }); // E18 by name
    expect(await verifyScan(db, usher, await pass(), opts)).toMatchObject({ result: "already_admitted", arrivedCount: 3, lastBy: "Gate 1" }); // BR-15
    expect((await reload()).arrivedCount).toBe(3);
    const rows = await db.select().from(vendorCheckIns).where(eq(vendorCheckIns.vendorId, id));
    expect(rows.map((r) => [r.count, r.method]).sort()).toEqual([[1, "manual"], [2, "scan"]]);
    const logs = await db.select().from(activityLog).where(eq(activityLog.vendorId, id));
    expect(logs.filter((l) => l.action === "vendor_admit").map((l) => l.actorLabel)).toEqual(["Gate 1", "Gate 1"]);
  });

  it("BR-14: can't admit more than the team, even at once (E5)", async () => {
    const { wedding, pass, reload } = await setup();
    const usher = await usherFor(db, wedding.id);
    await expect(admit(db, usher, { scanned: await pass() }, 4, opts)).rejects.toMatchObject({ code: "VALIDATION" });
    const scanned = await pass();
    const results = await Promise.allSettled([admit(db, usher, { scanned }, 2, opts), admit(db, usher, { scanned }, 2, opts)]);
    expect(results.filter((r) => r.status === "fulfilled" && r.value.result === "admitted")).toHaveLength(1);
    expect((await reload()).arrivedCount).toBe(2);
  });

  it("removed reads as revoked; a pass from before a new link is outdated; restoring doesn't revive it", async () => {
    const { wedding, ctx, id, pass } = await setup();
    const usher = await usherFor(db, wedding.id);
    const first = await pass();
    await removeVendor(db, ctx, id);
    expect(await verifyScan(db, usher, await pass(), opts)).toMatchObject({ result: "revoked", name: "Lens Studio" });
    await restoreVendor(db, ctx, id);
    expect(await verifyScan(db, usher, first, opts)).toMatchObject({ result: "outdated" });
    const beforeLink = await pass();
    await newVendorLink(db, ctx, id);
    expect(await verifyScan(db, usher, beforeLink, opts)).toMatchObject({ result: "outdated" });
    expect(await verifyScan(db, usher, await pass(), opts)).toMatchObject({ result: "ok" });
  });

  it("another wedding's vendor pass is invalid; passes expire after the wedding (E23)", async () => {
    const a = await setup();
    const b = await setup();
    expect(await verifyScan(db, await usherFor(db, b.wedding.id), await a.pass(), opts)).toEqual({ result: "invalid" });
    expect(await admit(db, await usherFor(db, b.wedding.id), { vendorId: a.id }, 1, opts)).toEqual({ result: "invalid" });
    expect(await verifyScan(db, await usherFor(db, a.wedding.id), await a.pass(), { now: new Date("2026-12-14T00:30:00+03:00") })).toEqual({ result: "expired" });
  });

  it("a vendor pass is never accepted as a guest pass", async () => {
    const { pass } = await setup();
    expect(await verifyPassToken((await pass()).split("/scan/v/")[1])).toBeNull();
  });

  it("E18: search finds active vendors by company, role or contact; never contact details", async () => {
    const { wedding, ctx, id } = await setup();
    const usher = await usherFor(db, wedding.id);
    const expected = [{ vendorId: id, name: "Lens Studio", role: "Photographer", partySize: 3, arrivedCount: 0 }];
    expect(await searchAtGate(db, usher, "lens")).toEqual(expected);
    expect(await searchAtGate(db, usher, "photo")).toEqual(expected);
    expect(await searchAtGate(db, usher, "achieng")).toEqual(expected);
    await removeVendor(db, ctx, id);
    expect(await searchAtGate(db, usher, "lens")).toEqual([]);
  });

  it("N3: the offline roster carries active vendors; offline check-ins upload once and flag overflow", async () => {
    const { wedding, ctx, id, reload } = await setup();
    const usher = await usherFor(db, wedding.id);
    const removed = await addVendor(db, ctx, { company: "Gone Ltd", role: "Decor", staffCount: 2 });
    await removeVendor(db, ctx, removed.id);
    const roster = await getGateRoster(db, usher, opts);
    expect(roster.vendors).toEqual([{ vendorId: id, passVersion: 1, name: "Lens Studio", role: "Photographer", partySize: 3, arrivedCount: 0 }]);

    const entries = [
      { clientRef: "vendor-ref-1", vendorId: id, passVersion: 1, count: 2, at: "2026-12-12T08:00:00Z" },
      { clientRef: "vendor-ref-2", vendorId: id, count: 2, at: "2026-12-12T08:05:00Z" },
    ];
    expect((await syncOfflineCheckIns(db, usher, entries, opts)).map((r) => r.outcome)).toEqual(["applied", "applied_partially"]);
    expect((await syncOfflineCheckIns(db, usher, entries, opts)).map((r) => r.outcome)).toEqual(["duplicate", "duplicate"]);
    expect((await reload()).arrivedCount).toBe(3);
    const conflicts = await db.select().from(activityLog).where(eq(activityLog.vendorId, id));
    expect(conflicts.filter((l) => l.action === "offline_checkin_conflict")).toHaveLength(1);
    await expect(syncOfflineCheckIns(db, usher, [{ clientRef: "vendor-ref-3", count: 1, at: "2026-12-12T08:05:00Z" }], opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("dashboard, export and deletion", () => {
  it("vendors have their own line and never enter guest headcount (BR-11)", async () => {
    const { wedding, ctx } = await setup();
    await addVendor(db, ctx, { company: "Tasty Caterers", role: "Caterer", staffCount: 8, mealCount: 6 });
    const gone = await addVendor(db, ctx, { company: "Gone Ltd", role: "Decor", staffCount: 5 });
    await removeVendor(db, ctx, gone.id);
    await createInvitation(db, wedding.id, { status: "approved" });
    const d = await getDashboard(db, ctx);
    expect(d.vendors).toEqual({ teams: 2, staff: 11, meals: 9, arrived: 0 });
    expect(d.headcount.approved).toBe(0); // the test guest has no party members; vendors add nothing
  });

  it("the vendor export lists active teams with meals, and is logged", async () => {
    const { ctx, id } = await setup();
    const gone = await addVendor(db, ctx, { company: "Gone Ltd", role: "Decor", staffCount: 5 });
    await removeVendor(db, ctx, gone.id);
    const { filename, csv } = await exportCsv(db, ctx, "vendors");
    expect(filename).toBe("vendors.csv");
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("Role,Company,Contact,Phone,Email,Staff,Meals,Arrive at,Arrived");
    expect(lines.slice(1)).toEqual([expect.stringMatching(/^Photographer,Lens Studio,Achieng Otieno,\+254700000881,lens@example\.com,3,3,,0$/)]);
    const logs = await db.select().from(activityLog).where(eq(activityLog.weddingId, ctx.weddingId));
    expect(logs.some((l) => l.action === "exported" && (l.meta as { kind: string }).kind === "vendors")).toBe(true);
    expect(id).toBeTruthy();
  });

  it("BR-23: vendor details are deleted with guest data", async () => {
    const { wedding, ctx, token } = await setup();
    const t = await token();
    expect(await purgeGuestData(db, wedding.id, { actor: "system" })).toMatchObject({ vendors: 1 });
    expect(await listVendors(db, ctx)).toEqual([]);
    await expect(getVendorPage(db, t)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the database refuses arrived > staff (BR-14 backstop)", async () => {
    const { id } = await setup();
    await expect(db.update(vendors).set({ arrivedCount: 4 }).where(eq(vendors.id, id))).rejects.toThrow();
  });
});
