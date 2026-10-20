"use server";

// Dashboard actions. Each one re-checks the admin session itself (getAdmin), because
// Server Actions can be called directly; the services then demand that proof (BR-10).

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { approveInvitation, declineAttendance } from "@/server/services/admin/approvals";
import { getAdmin } from "../_lib/auth";

export type ActionResult = { ok: true } | { ok: false; message: string; needsConfirmation?: boolean };

function fail(err: unknown): ActionResult {
  if (isAppError(err)) {
    const d = err.details as { needsConfirmation?: boolean } | undefined;
    return { ok: false, message: err.message, needsConfirmation: d?.needsConfirmation };
  }
  console.error(err);
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** BR-11: over capacity returns needsConfirmation; call again with confirm = true. */
export async function approveAction(invitationId: string, confirmOverCapacity = false): Promise<ActionResult> {
  const ctx = await getAdmin();
  try {
    await approveInvitation(getDb(), ctx, invitationId, { confirmOverCapacity });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function declineAction(invitationId: string): Promise<ActionResult> {
  const ctx = await getAdmin();
  try {
    await declineAttendance(getDb(), ctx, invitationId);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
