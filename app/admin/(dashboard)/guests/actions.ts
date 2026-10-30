"use server";

// Guest-list actions. Every one re-checks the admin session (getAdmin) before calling a
// service; the services then demand that proof and scope everything to this wedding.

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { createGmailMailer } from "@/server/integrations/mailer";
import { reopenAttendance, restoreInvitation, revokeInvitation } from "@/server/services/admin/approvals";
import { addInvitation, importInvitations, rotateInviteLink, updateInvitation, type ImportResult } from "@/server/services/admin/guests";
import { markEmailBounced, queueInvitationEmails, retryFailedEmails, sendNow, type ProcessSummary } from "@/server/services/messaging";
import { markLinkCopied, markWhatsappShared } from "@/server/services/whatsapp";
import { getAdmin } from "../../_lib/auth";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; fields?: Record<string, string>; existingId?: string };

function fail(err: unknown): { ok: false; message: string; fields?: Record<string, string>; existingId?: string } {
  if (isAppError(err)) {
    const d = err.details as { fields?: { path: string; message: string }[]; existingInvitationId?: string } | undefined;
    return {
      ok: false,
      message: err.message,
      fields: d?.fields ? Object.fromEntries(d.fields.map((f) => [f.path, f.message])) : undefined,
      existingId: d?.existingInvitationId,
    };
  }
  console.error(err);
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** One wrapper so no action can forget the session check or the page refresh. */
async function admin<T>(fn: (ctx: Awaited<ReturnType<typeof getAdmin>>) => Promise<T>, opts: { refresh?: boolean } = { refresh: true }): Promise<Result<T>> {
  const ctx = await getAdmin();
  try {
    const data = await fn(ctx);
    if (opts.refresh) refresh();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// --- add / edit / import ---

export type AddState = { status: "idle" } | { status: "error"; message: string; fields?: Record<string, string>; existingId?: string };

export async function addGuestAction(_prev: AddState, formData: FormData): Promise<AddState> {
  const raw = Object.fromEntries(["fullName", "phone", "email", "group", "side", "seatAllowance", "notes"].map((k) => [k, String(formData.get(k) ?? "")]));
  if (!raw.side) delete raw.side;
  if (raw.seatAllowance === "") delete raw.seatAllowance;
  const res = await admin((ctx) => addInvitation(getDb(), ctx, raw), { refresh: false });
  if (!res.ok) return { status: "error", message: res.message, fields: res.fields, existingId: res.existingId };
  redirect(`/admin/guests/${res.data!.id}`);
}

export async function updateGuestAction(id: string, patch: Record<string, unknown>, expectedUpdatedAt: string) {
  return admin((ctx) => updateInvitation(getDb(), ctx, id, patch, new Date(expectedUpdatedAt)));
}

export async function importAction(csv: string, dryRun: boolean): Promise<Result<ImportResult>> {
  return admin((ctx) => importInvitations(getDb(), ctx, csv, { dryRun }), { refresh: !dryRun });
}

// --- sending (D7: "Send now" drains the queue in batches; the page calls it again while work remains) ---

export async function queueEmailsAction(ids: string[]) {
  return admin((ctx) => queueInvitationEmails(getDb(), ctx, ids));
}

export async function sendNowAction(): Promise<Result<ProcessSummary>> {
  return admin((ctx) => sendNow(getDb(), ctx, createGmailMailer(), { timeBudgetMs: 40_000 }));
}

export async function retryFailedAction() {
  return admin((ctx) => retryFailedEmails(getDb(), ctx));
}

export async function markWhatsappSharedAction(id: string) {
  return admin((ctx) => markWhatsappShared(getDb(), ctx, id));
}

/** D28: copying a guest's link counts as sending it. */
export async function markLinkCopiedAction(id: string) {
  return admin((ctx) => markLinkCopied(getDb(), ctx, id));
}

export async function markBouncedAction(id: string) {
  return admin((ctx) => markEmailBounced(getDb(), ctx, id));
}

// --- link and status ---

export async function rotateLinkAction(id: string) {
  return admin((ctx) => rotateInviteLink(getDb(), ctx, id));
}

export async function revokeAction(id: string, notifyGuest: boolean) {
  return admin((ctx) => revokeInvitation(getDb(), ctx, id, { notifyGuest }));
}

export async function restoreAction(id: string) {
  return admin((ctx) => restoreInvitation(getDb(), ctx, id));
}

export async function reopenAction(id: string) {
  return admin((ctx) => reopenAttendance(getDb(), ctx, id));
}
