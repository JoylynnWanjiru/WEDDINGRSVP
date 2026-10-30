// "Send on WhatsApp" (PROJECT_SPEC §10). The admin's phone opens WhatsApp with the
// personal message pre-filled; marking it shared is the record that the link went out.
// "Viewed" still only comes from the guest opening the link (U3).

import { and, eq } from "drizzle-orm";
import { inviteLink } from "../auth/tokens";
import type { Db } from "../db/client";
import { invitations, weddings, type Invitation, type Wedding } from "../db/schema";
import { AppError } from "../errors";
import { formatDate, formatDateTime } from "../utils/dates";
import { DEFAULT_WHATSAPP_TEMPLATE, fillTemplate, whatsappUrl } from "../utils/whatsapp";
import { adminActor, type AdminCtx } from "./admin/context";
import { applyTransition, lockInvitation } from "./transitions";

/** The wa.me link and message for one guest, or null if they can't be sent one. */
export function buildWhatsappShare(inv: Invitation, wedding: Wedding): { url: string; message: string } | null {
  if (!inv.phone || inv.status === "revoked") return null;
  const message = fillTemplate(wedding.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE, {
    firstName: inv.fullName.trim().split(/\s+/)[0],
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    date: formatDate(wedding.weddingDate),
    personalLink: inviteLink(inv.id, inv.inviteTokenVersion),
    rsvpDeadline: formatDateTime(wedding.rsvpDeadline),
  });
  return { url: whatsappUrl(inv.phone, message), message };
}

export async function getWhatsappShare(db: Db, ctx: AdminCtx, invitationId: string): Promise<{ url: string; message: string }> {
  const [row] = await db
    .select({ inv: invitations, wedding: weddings })
    .from(invitations)
    .innerJoin(weddings, eq(invitations.weddingId, weddings.id))
    .where(and(eq(invitations.id, invitationId), eq(invitations.weddingId, ctx.weddingId)));
  if (!row) throw new AppError("NOT_FOUND", "Guest not found.");
  if (!row.inv.phone) throw new AppError("VALIDATION", "This guest has no phone number.");
  if (row.inv.status === "revoked") throw new AppError("CONFLICT", "This invitation is revoked.");
  return buildWhatsappShare(row.inv, row.wedding)!;
}

/** Records whatsapp_shared_at and moves a draft to SENT (§5a). */
export async function markWhatsappShared(db: Db, ctx: AdminCtx, invitationId: string, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    return applyTransition(tx, inv, { type: "send" }, adminActor(ctx), { set: { whatsappSharedAt: now }, meta: { channel: "whatsapp" } });
  });
}

/**
 * D28: "Copy link" in the admin counts as sending, because the couple pastes it into WhatsApp
 * (or anywhere) by hand. Records link_copied_at and moves a draft to SENT, like the WhatsApp button.
 */
export async function markLinkCopied(db: Db, ctx: AdminCtx, invitationId: string, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    const inv = await lockInvitation(tx, ctx.weddingId, invitationId);
    if (inv.status === "revoked") throw new AppError("CONFLICT", "This invitation is revoked.");
    return applyTransition(tx, inv, { type: "send" }, adminActor(ctx), { set: { linkCopiedAt: now }, meta: { channel: "copy" } });
  });
}
