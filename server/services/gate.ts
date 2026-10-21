// Gate pass and check-in (PROJECT_SPEC §9, BLUEPRINT BR-13 to BR-16, E3, E4, E5, E17, E18, E23).
//
// The QR holds a signed pass token (invitation id, wedding id, pass version) and no
// personal data. Every scan is checked live against the database; admissions lock the
// invitation row, so two ushers scanning the same pass can never over-admit (BR-14).
// Vendor passes (D25) go through the same checks, with the team's staff count as the party size.

import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { tokenFromScan } from "../../lib/gate-offline";
import type { UsherSession } from "../auth/sessions";
import { signPassToken, signVendorPassToken, verifyPassToken, verifyVendorPassToken } from "../auth/tokens";
import { config } from "../config";
import type { Db } from "../db/client";
import { checkIns, invitations, partyMembers, vendorCheckIns, vendors, weddings, type Invitation, type Vendor, type Wedding } from "../db/schema";
import { AppError } from "../errors";
import { qrSvg } from "../integrations/qr";
import { addDays, nairobiDate } from "../utils/dates";
import { z } from "zod";
import { parseInput } from "../validation/schemas";
import { logActivity } from "./activity";
import { requireApproved } from "./access";
import { applyTransition, lockInvitation } from "./transitions";

/** The URL inside the QR. Opened by a normal camera it shows "please show this to an usher". */
export const scanUrl = (passToken: string) => `${config.appUrl()}/scan/v/${passToken}`;

export async function passTokenFor(inv: Invitation): Promise<string> {
  return signPassToken({ invitationId: inv.id, weddingId: inv.weddingId, passVersion: inv.passVersion });
}

// Shared with the scanner page, which reads the same URL offline (N3).
export { tokenFromScan };

// --- guest side: the gate pass section of the invitation page (D22) ---

/** Pass data for an approved guest. Viewing is recorded by recordView (a real tap), not here. */
export async function getGatePass(db: Db, token: string | null | undefined) {
  const { invitation: inv, wedding } = await requireApproved(db, token); // BR-1: pass is approved-only
  const passToken = await passTokenFor(inv);
  return {
    guestName: inv.fullName,
    partySize: inv.partySize, // "Wanjiru + 2" is partySize - 1 extras
    arrivedCount: inv.arrivedCount,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    weddingDate: wedding.weddingDate,
    gatesOpenAt: wedding.gatesOpenAt,
    scanUrl: scanUrl(passToken),
    qrSvg: await qrSvg(scanUrl(passToken)),
  };
}

// --- usher side ---

export type ScanResult =
  | { result: "ok"; invitationId: string; name: string; partySize: number; arrivedCount: number; remaining: number }
  | { result: "already_admitted"; invitationId: string; name: string; partySize: number; arrivedCount: number; lastAt: Date | null; lastBy: string | null }
  | { result: "revoked" | "not_approved" | "outdated"; name: string }
  | { result: "invalid" | "expired" };

/** E23: passes stop working after the wedding day (a day's grace for the after-midnight send-off). */
const isExpired = (w: Wedding, now: Date) => nairobiDate(now) > addDays(w.weddingDate, 1);

async function lastCheckIn(db: Db, invitationId: string) {
  const [last] = await db
    .select({ at: checkIns.at, by: checkIns.usherDevice })
    .from(checkIns)
    .where(eq(checkIns.invitationId, invitationId))
    .orderBy(desc(checkIns.at))
    .limit(1);
  return last ?? null;
}

/** BR-13 for one invitation. `passVersion` is null for manual (name search) admits. */
async function evaluate(db: Db, inv: Invitation, wedding: Wedding, passVersion: number | null, now: Date): Promise<ScanResult> {
  if (isExpired(wedding, now)) return { result: "expired" };
  if (inv.status === "revoked") return { result: "revoked", name: inv.fullName };
  if (passVersion !== null && passVersion !== inv.passVersion) return { result: "outdated", name: inv.fullName }; // E6, E22
  if (!["approved", "partially_arrived", "arrived"].includes(inv.status)) return { result: "not_approved", name: inv.fullName };
  const remaining = inv.partySize - inv.arrivedCount;
  if (remaining <= 0) {
    const last = await lastCheckIn(db, inv.id); // BR-15
    return { result: "already_admitted", invitationId: inv.id, name: inv.fullName, partySize: inv.partySize, arrivedCount: inv.arrivedCount, lastAt: last?.at ?? null, lastBy: last?.by ?? null };
  }
  return { result: "ok", invitationId: inv.id, name: inv.fullName, partySize: inv.partySize, arrivedCount: inv.arrivedCount, remaining };
}

async function loadForUsher(db: Db, usher: UsherSession, invitationId: string) {
  const [row] = await db
    .select({ inv: invitations, wedding: weddings })
    .from(invitations)
    .innerJoin(weddings, eq(invitations.weddingId, weddings.id))
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, usher.weddingId)));
  return row ?? null;
}

/** Step 1 at the gate: what does this QR mean? Shows name and party size only (§9). */
export async function verifyScan(db: Db, usher: UsherSession, scanned: string, opts: { now?: Date } = {}): Promise<ScanResult | VendorScanResult> {
  const token = tokenFromScan(scanned);
  const claims = await verifyPassToken(token);
  if (!claims) return verifyVendorScan(db, usher, token, opts.now ?? new Date()); // D25
  if (claims.weddingId !== usher.weddingId) return { result: "invalid" };
  const row = await loadForUsher(db, usher, claims.invitationId);
  if (!row || row.wedding.purgedAt) return { result: "invalid" };
  return evaluate(db, row.inv, row.wedding, claims.passVersion, opts.now ?? new Date());
}

type AdmitOpts = { now?: Date; at?: Date; clientRef?: string; method?: "scan" | "manual" | "offline_sync" };

export type AdmitResult = ScanResult | { result: "admitted"; invitationId: string; name: string; partySize: number; arrivedCount: number; remaining: number } | { result: "duplicate" };

/**
 * Step 2: admit `count` people (BR-16: fewer than the full party is fine). Either a
 * scanned pass or, for guests without a phone, an invitation found by name (E18).
 * Re-checks everything under a row lock, so simultaneous scans can't over-admit (BR-14, E5).
 */
export async function admit(
  db: Db,
  usher: UsherSession,
  target: { scanned: string } | { invitationId: string; passVersion?: number } | { vendorId: string; passVersion?: number },
  count: number,
  opts: AdmitOpts = {},
): Promise<AdmitResult | VendorAdmitResult> {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new AppError("VALIDATION", "Admit between 1 and the party size.");
  const now = opts.now ?? new Date();
  if ("vendorId" in target) return admitVendor(db, usher, target.vendorId, target.passVersion ?? null, count, { ...opts, method: opts.method ?? "manual" }, now);

  let invitationId: string;
  let passVersion: number | null;
  let method = opts.method;
  if ("scanned" in target) {
    const token = tokenFromScan(target.scanned);
    const claims = await verifyPassToken(token);
    if (!claims) {
      const vendor = await verifyVendorPassToken(token); // D25
      if (!vendor || vendor.weddingId !== usher.weddingId) return { result: "invalid" };
      return admitVendor(db, usher, vendor.vendorId, vendor.passVersion, count, { ...opts, method: opts.method ?? "scan" }, now);
    }
    if (claims.weddingId !== usher.weddingId) return { result: "invalid" };
    invitationId = claims.invitationId;
    passVersion = claims.passVersion;
    method ??= "scan";
  } else {
    invitationId = target.invitationId;
    passVersion = target.passVersion ?? null;
    method ??= "manual";
  }

  if (opts.clientRef) {
    const [seen] = await db.select({ id: checkIns.id }).from(checkIns).where(eq(checkIns.clientRef, opts.clientRef));
    if (seen) return { result: "duplicate" }; // offline sync retried
  }

  return db.transaction(async (tx) => {
    const row = await loadForUsher(tx, usher, invitationId);
    if (!row || row.wedding.purgedAt) return { result: "invalid" as const };
    const inv = await lockInvitation(tx, usher.weddingId, invitationId);
    const check = await evaluate(tx, inv, row.wedding, passVersion, now);
    if (check.result !== "ok") return check;
    if (count > check.remaining) {
      throw new AppError("VALIDATION", `Only ${check.remaining} of ${inv.partySize} left to admit.`, { remaining: check.remaining });
    }

    const arrivedAfter = inv.arrivedCount + count;
    await applyTransition(tx, inv, { type: "admit", arrivedAfter, partySize: inv.partySize }, { actor: "usher", label: usher.device }, {
      set: { arrivedCount: arrivedAfter },
      meta: { count, method },
    });
    await tx.insert(checkIns).values({
      weddingId: usher.weddingId,
      invitationId: inv.id,
      count,
      method,
      usherDevice: usher.device,
      clientRef: opts.clientRef,
      at: opts.at && opts.at < now ? opts.at : now,
    });
    return { result: "admitted" as const, invitationId: inv.id, name: inv.fullName, partySize: inv.partySize, arrivedCount: arrivedAfter, remaining: inv.partySize - arrivedAfter };
  });
}

/** E18: find an approved guest by their own or any party member's name. No contact details. */
export async function searchAtGate(db: Db, usher: UsherSession, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  return [...(await searchGuests(db, usher, like)), ...(await searchVendors(db, usher, like))];
}

async function searchGuests(db: Db, usher: UsherSession, like: string) {
  const matches = await db
    .selectDistinct({ id: invitations.id })
    .from(invitations)
    .leftJoin(partyMembers, eq(partyMembers.invitationId, invitations.id))
    .where(
      and(
        eq(invitations.weddingId, usher.weddingId),
        inArray(invitations.status, ["approved", "partially_arrived", "arrived"]),
        or(ilike(invitations.fullName, like), ilike(partyMembers.fullName, like)),
      ),
    )
    .limit(20);
  if (!matches.length) return [];
  const ids = matches.map((m) => m.id);
  const [rows, members] = await Promise.all([
    db.select().from(invitations).where(inArray(invitations.id, ids)),
    db.select().from(partyMembers).where(inArray(partyMembers.invitationId, ids)),
  ]);
  return rows
    .map((r) => ({
      invitationId: r.id,
      name: r.fullName,
      partySize: r.partySize,
      arrivedCount: r.arrivedCount,
      members: members.filter((m) => m.invitationId === r.id).sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.fullName),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * N3 / E17: the approved list cached by the scanner at the start of the day, so it can
 * keep working without signal. Names and pass versions only; the scanner shows
 * "last synced" so ushers know how fresh it is (E4).
 */
export async function getGateRoster(db: Db, usher: UsherSession, opts: { now?: Date } = {}) {
  const rows = await db
    .select({ invitationId: invitations.id, passVersion: invitations.passVersion, name: invitations.fullName, partySize: invitations.partySize, arrivedCount: invitations.arrivedCount })
    .from(invitations)
    .where(and(eq(invitations.weddingId, usher.weddingId), inArray(invitations.status, ["approved", "partially_arrived", "arrived"])));
  const vendorRows = await db
    .select({ vendorId: vendors.id, passVersion: vendors.passVersion, name: vendors.company, role: vendors.role, partySize: vendors.staffCount, arrivedCount: vendors.arrivedCount })
    .from(vendors)
    .where(and(eq(vendors.weddingId, usher.weddingId), isNull(vendors.removedAt)));
  return { syncedAt: opts.now ?? new Date(), guests: rows, vendors: vendorRows }; // D25
}

const offlineEntries = z
  .array(
    z
      .object({
        clientRef: z.string().min(8).max(64),
        invitationId: z.uuid().optional(),
        vendorId: z.uuid().optional(), // D25
        passVersion: z.number().int().min(1).optional(),
        count: z.number().int().min(1).max(50),
        at: z.coerce.date(),
      })
      .refine((e) => !!e.invitationId !== !!e.vendorId, { message: "Each check-in is for one guest or one vendor." }),
  )
  .max(500);

export type SyncResult = { clientRef: string; outcome: "applied" | "applied_partially" | "duplicate" | "rejected"; reason?: string };

/**
 * Uploads check-ins recorded offline. Each applies once (client_ref). People are
 * already inside, so conflicts (revoked meanwhile, more than the party size) are
 * applied as far as possible and flagged in the activity log for the couple.
 */
export async function syncOfflineCheckIns(db: Db, usher: UsherSession, raw: unknown, opts: { now?: Date } = {}): Promise<SyncResult[]> {
  const entries = parseInput(offlineEntries, raw);
  const results: SyncResult[] = [];
  for (const e of entries) {
    const conflict = async (reason: string) => {
      await logActivity(db, {
        weddingId: usher.weddingId,
        actor: "usher",
        actorLabel: usher.device,
        invitationId: e.invitationId && (await loadForUsher(db, usher, e.invitationId)) ? e.invitationId : undefined,
        vendorId: e.vendorId && (await loadVendorForUsher(db, usher, e.vendorId)) ? e.vendorId : undefined,
        action: "offline_checkin_conflict",
        meta: { clientRef: e.clientRef, count: e.count, reason },
      });
    };
    const attempt = (count: number) =>
      admit(db, usher, e.vendorId ? { vendorId: e.vendorId, passVersion: e.passVersion } : { invitationId: e.invitationId!, passVersion: e.passVersion }, count, {
        ...opts,
        at: e.at,
        clientRef: e.clientRef,
        method: "offline_sync",
      });

    let res = await attempt(e.count).catch((err) => err);
    if (res instanceof AppError && typeof (res.details as { remaining?: number })?.remaining === "number") {
      const remaining = (res.details as { remaining: number }).remaining;
      res = await attempt(remaining);
      await conflict(`Recorded ${e.count} offline but only ${remaining} were left in the party.`);
      results.push({ clientRef: e.clientRef, outcome: "applied_partially", reason: "More people than the party size." });
      continue;
    }
    if (res instanceof Error) throw res;
    if (res.result === "admitted") results.push({ clientRef: e.clientRef, outcome: "applied" });
    else if (res.result === "duplicate") results.push({ clientRef: e.clientRef, outcome: "duplicate" });
    else {
      await conflict(res.result);
      results.push({ clientRef: e.clientRef, outcome: "rejected", reason: res.result });
    }
  }
  return results;
}

// --- vendors at the gate (D25) ---

export async function vendorPassTokenFor(v: Vendor): Promise<string> {
  return signVendorPassToken({ vendorId: v.id, weddingId: v.weddingId, passVersion: v.passVersion });
}

type VendorFields = { vendorId: string; name: string; role: string };

/** What the usher sees for a vendor: "Vendor", role, company and staff count. Never contact details. */
export type VendorScanResult =
  | ({ result: "ok"; partySize: number; arrivedCount: number; remaining: number } & VendorFields)
  | ({ result: "already_admitted"; partySize: number; arrivedCount: number; lastAt: Date | null; lastBy: string | null } & VendorFields)
  | ({ result: "revoked" | "outdated" } & VendorFields)
  | { result: "invalid" | "expired" };

export type VendorAdmitResult =
  | VendorScanResult
  | ({ result: "admitted"; partySize: number; arrivedCount: number; remaining: number } & VendorFields)
  | { result: "duplicate" };

const vendorFields = (v: Vendor): VendorFields => ({ vendorId: v.id, name: v.company, role: v.role });

/** BR-13 for a vendor team: removed reads as "revoked"; an old pass version is "outdated" (as E22). */
async function evaluateVendor(db: Db, v: Vendor, wedding: Wedding, passVersion: number | null, now: Date): Promise<VendorScanResult> {
  if (isExpired(wedding, now)) return { result: "expired" }; // E23
  if (v.removedAt) return { result: "revoked", ...vendorFields(v) };
  if (passVersion !== null && passVersion !== v.passVersion) return { result: "outdated", ...vendorFields(v) };
  const remaining = v.staffCount - v.arrivedCount;
  if (remaining <= 0) {
    const [last] = await db
      .select({ at: vendorCheckIns.at, by: vendorCheckIns.usherDevice })
      .from(vendorCheckIns)
      .where(eq(vendorCheckIns.vendorId, v.id))
      .orderBy(desc(vendorCheckIns.at))
      .limit(1); // BR-15
    return { result: "already_admitted", ...vendorFields(v), partySize: v.staffCount, arrivedCount: v.arrivedCount, lastAt: last?.at ?? null, lastBy: last?.by ?? null };
  }
  return { result: "ok", ...vendorFields(v), partySize: v.staffCount, arrivedCount: v.arrivedCount, remaining };
}

async function loadVendorForUsher(db: Db, usher: UsherSession, vendorId: string, lock = false) {
  const query = db
    .select({ vendor: vendors, wedding: weddings })
    .from(vendors)
    .innerJoin(weddings, eq(vendors.weddingId, weddings.id))
    .where(and(eq(vendors.id, vendorId), eq(vendors.weddingId, usher.weddingId)));
  const [row] = lock ? await query.for("update", { of: vendors }) : await query;
  return row ?? null;
}

async function verifyVendorScan(db: Db, usher: UsherSession, token: string, now: Date): Promise<VendorScanResult> {
  const claims = await verifyVendorPassToken(token);
  if (!claims || claims.weddingId !== usher.weddingId) return { result: "invalid" };
  const row = await loadVendorForUsher(db, usher, claims.vendorId);
  if (!row || row.wedding.purgedAt) return { result: "invalid" };
  return evaluateVendor(db, row.vendor, row.wedding, claims.passVersion, now);
}

/** Same guarantees as admit(): a row lock, so two ushers can't over-admit a team (BR-14, E5). */
async function admitVendor(
  db: Db,
  usher: UsherSession,
  vendorId: string,
  passVersion: number | null,
  count: number,
  opts: AdmitOpts & { method: "scan" | "manual" | "offline_sync" },
  now: Date,
): Promise<VendorAdmitResult> {
  if (opts.clientRef) {
    const [seen] = await db.select({ id: vendorCheckIns.id }).from(vendorCheckIns).where(eq(vendorCheckIns.clientRef, opts.clientRef));
    if (seen) return { result: "duplicate" }; // offline sync retried
  }
  return db.transaction(async (tx) => {
    const row = await loadVendorForUsher(tx, usher, vendorId, true);
    if (!row || row.wedding.purgedAt) return { result: "invalid" as const };
    const v = row.vendor;
    const check = await evaluateVendor(tx, v, row.wedding, passVersion, now);
    if (check.result !== "ok") return check;
    if (count > check.remaining) {
      throw new AppError("VALIDATION", `Only ${check.remaining} of ${v.staffCount} left to admit.`, { remaining: check.remaining });
    }
    const arrivedAfter = v.arrivedCount + count;
    await tx.update(vendors).set({ arrivedCount: arrivedAfter }).where(eq(vendors.id, v.id));
    await tx.insert(vendorCheckIns).values({
      weddingId: usher.weddingId,
      vendorId: v.id,
      count,
      method: opts.method,
      usherDevice: usher.device,
      clientRef: opts.clientRef,
      at: opts.at && opts.at < now ? opts.at : now,
    });
    await logActivity(tx, { weddingId: usher.weddingId, actor: "usher", actorLabel: usher.device, vendorId: v.id, action: "vendor_admit", meta: { count, method: opts.method } });
    return { result: "admitted" as const, ...vendorFields(v), partySize: v.staffCount, arrivedCount: arrivedAfter, remaining: v.staffCount - arrivedAfter };
  });
}

/** E18 for vendors: by company, role or contact person. Active vendors only; no contact details. */
async function searchVendors(db: Db, usher: UsherSession, like: string) {
  const rows = await db
    .select()
    .from(vendors)
    .where(
      and(
        eq(vendors.weddingId, usher.weddingId),
        isNull(vendors.removedAt),
        or(ilike(vendors.company, like), ilike(vendors.role, like), ilike(vendors.contactName, like)),
      ),
    )
    .orderBy(vendors.company)
    .limit(20);
  return rows.map((v) => ({ ...vendorFields(v), partySize: v.staffCount, arrivedCount: v.arrivedCount }));
}
