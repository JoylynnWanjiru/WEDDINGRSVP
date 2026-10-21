// Gate pass and check-in (PROJECT_SPEC §9, BLUEPRINT BR-13 to BR-16, E3, E4, E5, E17, E18, E23).
//
// The QR holds a signed pass token (invitation id, wedding id, pass version) and no
// personal data. Every scan is checked live against the database; admissions lock the
// invitation row, so two ushers scanning the same pass can never over-admit (BR-14).

import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { tokenFromScan } from "../../lib/gate-offline";
import type { UsherSession } from "../auth/sessions";
import { signPassToken, verifyPassToken } from "../auth/tokens";
import { config } from "../config";
import type { Db } from "../db/client";
import { checkIns, invitations, partyMembers, weddings, type Invitation, type Wedding } from "../db/schema";
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
export async function verifyScan(db: Db, usher: UsherSession, scanned: string, opts: { now?: Date } = {}): Promise<ScanResult> {
  const claims = await verifyPassToken(tokenFromScan(scanned));
  if (!claims || claims.weddingId !== usher.weddingId) return { result: "invalid" };
  const row = await loadForUsher(db, usher, claims.invitationId);
  if (!row || row.wedding.purgedAt) return { result: "invalid" };
  return evaluate(db, row.inv, row.wedding, claims.passVersion, opts.now ?? new Date());
}

export type AdmitResult = ScanResult | { result: "admitted"; invitationId: string; name: string; partySize: number; arrivedCount: number; remaining: number } | { result: "duplicate" };

/**
 * Step 2: admit `count` people (BR-16: fewer than the full party is fine). Either a
 * scanned pass or, for guests without a phone, an invitation found by name (E18).
 * Re-checks everything under a row lock, so simultaneous scans can't over-admit (BR-14, E5).
 */
export async function admit(
  db: Db,
  usher: UsherSession,
  target: { scanned: string } | { invitationId: string; passVersion?: number },
  count: number,
  opts: { now?: Date; at?: Date; clientRef?: string; method?: "scan" | "manual" | "offline_sync" } = {},
): Promise<AdmitResult> {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new AppError("VALIDATION", "Admit between 1 and the party size.");
  const now = opts.now ?? new Date();

  let invitationId: string;
  let passVersion: number | null;
  let method = opts.method;
  if ("scanned" in target) {
    const claims = await verifyPassToken(tokenFromScan(target.scanned));
    if (!claims || claims.weddingId !== usher.weddingId) return { result: "invalid" };
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
  return { syncedAt: opts.now ?? new Date(), guests: rows };
}

const offlineEntries = z
  .array(
    z.object({
      clientRef: z.string().min(8).max(64),
      invitationId: z.uuid(),
      passVersion: z.number().int().min(1).optional(),
      count: z.number().int().min(1).max(50),
      at: z.coerce.date(),
    }),
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
        invitationId: (await loadForUsher(db, usher, e.invitationId)) ? e.invitationId : undefined,
        action: "offline_checkin_conflict",
        meta: { clientRef: e.clientRef, count: e.count, reason },
      });
    };
    const attempt = (count: number) =>
      admit(db, usher, { invitationId: e.invitationId, passVersion: e.passVersion }, count, { ...opts, at: e.at, clientRef: e.clientRef, method: "offline_sync" });

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
