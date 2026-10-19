// Guest RSVP: submit or change a response (BLUEPRINT §5a, BR-5 to BR-9, E1, E6, E7, E14).

import { createHash } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { invitations, partyMembers, rsvpEvents, venues, type Invitation } from "../db/schema";
import { normalizePhone } from "../domain/phone";
import { assertPartyWithinAllowance, isRsvpOpen, partyNeedsReapproval } from "../domain/rules";
import { canRespond, nextStatus, type InvitationStatus } from "../domain/status";
import { AppError } from "../errors";
import { parseInput, rsvpInput, type RsvpInput } from "../validation/schemas";
import { getAccess } from "./access";
import { logActivity } from "./activity";
import { enqueueEmail } from "./messaging";

export type RsvpResult = {
  status: InvitationStatus;
  partySize: number;
  /** True when the couple now needs to approve (said Yes, or added someone after approval). */
  awaitingApproval: boolean;
  /** True when nothing changed because this exact response was already saved (BR-9). */
  unchanged: boolean;
};

export async function submitRsvp(
  db: Db,
  token: string | null | undefined,
  raw: unknown,
  opts: { now?: Date } = {},
): Promise<RsvpResult> {
  const input = parseInput(rsvpInput, raw);
  const now = opts.now ?? new Date();

  const access = await getAccess(db, token);
  if (access.level === "public") throw new AppError("FORBIDDEN", "This invitation link isn't valid.");
  const { wedding } = access;

  // BR-7 / E14: guests can't respond after the deadline (admins record late responses in Module 4).
  if (!isRsvpOpen(wedding.rsvpDeadline, now)) {
    throw new AppError("DEADLINE_PASSED", "The RSVP deadline has passed. Please contact the couple.");
  }

  const phone = normalizeOptionalPhone(input.phone);
  const fingerprint = fingerprintOf(input, phone);

  return db.transaction(async (tx) => {
    // Lock the invitation so concurrent submissions (E1) apply one after another.
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, access.invitation.id)).for("update");
    assertCanRespond(inv.status);

    // BR-9: an identical resubmission (double tap, retry) changes nothing and sends nothing.
    if (inv.responseFingerprint === fingerprint && inv.respondedAt) {
      nextStatus(inv.status, input.attending ? { type: "respond_yes", partyGrew: false } : { type: "respond_no" });
      return result(inv.status, inv.partySize, true);
    }

    if (phone) await assertPhoneFree(tx, inv, phone);

    const current = await tx.select().from(partyMembers).where(eq(partyMembers.invitationId, inv.id));
    const weddingEvents = await eventsOf(tx, inv.weddingId);

    let to: InvitationStatus;
    let members: (typeof partyMembers.$inferInsert)[];
    let attendingEvents: Set<string>;

    if (input.attending) {
      assertPartyWithinAllowance(input.extras.length, inv.seatAllowance); // BR-5
      members = [
        { ...input.primary, invitationId: inv.id, isChild: false, isPrimary: true, sortOrder: 0 },
        ...input.extras.map((m, i) => ({ ...m, invitationId: inv.id, isPrimary: false, sortOrder: i + 1 })),
      ];
      const partyGrew = partyNeedsReapproval(current, members); // BR-8
      to = nextStatus(inv.status, { type: "respond_yes", partyGrew });

      const chosen = input.events ?? weddingEvents;
      const unknown = chosen.filter((e) => !weddingEvents.includes(e));
      if (unknown.length) throw new AppError("VALIDATION", "Please choose from this wedding's events.", { unknown });
      if (weddingEvents.length && !chosen.length) {
        throw new AppError("VALIDATION", "Please choose at least one event, or answer No.");
      }
      attendingEvents = new Set(chosen);
    } else {
      to = nextStatus(inv.status, { type: "respond_no" });
      // Keep only the primary guest so totals stay right; extras can be re-entered on a new Yes.
      const primary = current.find((m) => m.isPrimary);
      members = [
        {
          invitationId: inv.id,
          fullName: primary?.fullName ?? inv.fullName,
          isChild: false,
          dietary: primary?.dietary ?? "none",
          dietaryNotes: primary?.dietaryNotes ?? null,
          isPrimary: true,
          sortOrder: 0,
        },
      ];
      attendingEvents = new Set();
    }

    // Leaving APPROVED (party grew, or changed to No) invalidates the old pass (§5a, E6, E7).
    const passVersion = inv.status === "approved" && to !== "approved" ? inv.passVersion + 1 : inv.passVersion;

    await tx.delete(partyMembers).where(eq(partyMembers.invitationId, inv.id));
    await tx.insert(partyMembers).values(members);
    await tx.delete(rsvpEvents).where(eq(rsvpEvents.invitationId, inv.id));
    if (weddingEvents.length) {
      await tx
        .insert(rsvpEvents)
        .values(weddingEvents.map((event) => ({ invitationId: inv.id, event, attending: attendingEvents.has(event) })));
    }

    await tx
      .update(invitations)
      .set({
        status: to,
        partySize: members.length,
        passVersion,
        respondedAt: now,
        responseMessage: input.message ?? null,
        responseFingerprint: fingerprint,
        ...(input.email ? { email: input.email } : {}),
        ...(phone ? { phone } : {}),
      })
      .where(eq(invitations.id, inv.id));

    await logActivity(tx, {
      weddingId: inv.weddingId,
      actor: "guest",
      invitationId: inv.id,
      action: input.attending ? "rsvp_yes" : "rsvp_no",
      meta: { from: inv.status, to, partySize: members.length, passVersionBumped: passVersion !== inv.passVersion },
    });

    // BR-18: this email confirms receipt only; the template carries no event details.
    if (input.email ?? inv.email) {
      await enqueueEmail(tx, {
        weddingId: inv.weddingId,
        invitationId: inv.id,
        template: "rsvp_received",
        dedupeKey: `rsvp_received:${inv.id}:${fingerprint}`,
      });
    }

    return result(to, members.length, false);
  });
}

const result = (status: InvitationStatus, partySize: number, unchanged: boolean): RsvpResult => ({
  status,
  partySize,
  awaitingApproval: status === "awaiting_approval",
  unchanged,
});

/** Guest-facing messages for the states that can't respond (the lifecycle would reject them anyway). */
function assertCanRespond(status: InvitationStatus): void {
  if (canRespond(status)) return;
  if (status === "revoked") throw new AppError("FORBIDDEN", "This invitation is no longer active.");
  if (status === "not_approved") {
    throw new AppError("CONFLICT", "The couple has already replied to your response. Please contact them directly.");
  }
  throw new AppError("CONFLICT", "Your response can't be changed after arriving. Please speak to an usher.");
}

function normalizeOptionalPhone(input: string | undefined): string | null {
  if (!input) return null;
  const phone = normalizePhone(input); // BR-20
  if (!phone) throw new AppError("VALIDATION", "Please enter a valid phone number, e.g. 0712 345 678.");
  return phone;
}

/** BR-21: a guest can't take a phone number that belongs to another invitation. */
async function assertPhoneFree(db: Db, inv: Invitation, phone: string): Promise<void> {
  if (inv.phone === phone) return;
  const [other] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.weddingId, inv.weddingId), eq(invitations.phone, phone), ne(invitations.id, inv.id)));
  if (other) {
    throw new AppError("CONFLICT", "That phone number is already linked to another invitation. Please contact the couple.");
  }
}

/** The wedding's events are the kinds of venue it has (ceremony, reception, traditional). */
async function eventsOf(db: Db, weddingId: string): Promise<RsvpEventKind[]> {
  const rows = await db.select({ kind: venues.kind }).from(venues).where(eq(venues.weddingId, weddingId)).orderBy(asc(venues.sortOrder));
  return [...new Set(rows.map((r) => r.kind))];
}

type RsvpEventKind = (typeof rsvpEvents.$inferInsert)["event"];

function fingerprintOf(input: RsvpInput, phone: string | null): string {
  return createHash("sha256").update(JSON.stringify({ ...input, phone })).digest("base64url");
}
