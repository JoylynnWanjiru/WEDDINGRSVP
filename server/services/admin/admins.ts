// Who can sign in to the admin (BLUEPRINT D26). Each person is named and has their own
// authenticator app, so the couple can add the planner, remove someone, or reset a lost
// phone, and the activity log says who did what.

import { and, asc, eq } from "drizzle-orm";
import { adminSetupLink, createAdmin, resetAdminAuthenticator } from "../../auth/admins";
import type { Db } from "../../db/client";
import { admins } from "../../db/schema";
import { AppError } from "../../errors";
import { adminInput, parseInput } from "../../validation/schemas";
import { logActivity } from "../activity";
import { adminLog, type AdminCtx } from "./context";

export type AdminRow = { id: string; name: string; email: string; ready: boolean; isYou: boolean };

export async function listAdmins(db: Db, ctx: AdminCtx): Promise<AdminRow[]> {
  const rows = await db.select().from(admins).where(eq(admins.weddingId, ctx.weddingId)).orderBy(asc(admins.createdAt), asc(admins.name));
  return rows.map((a) => ({ id: a.id, name: a.name, email: a.email, ready: !!a.totpConfirmedAt, isYou: a.id === ctx.session.adminId }));
}

/** Returns the one-time setup link to hand to the new admin (copy or WhatsApp). */
export async function addAdmin(db: Db, ctx: AdminCtx, raw: unknown): Promise<{ id: string; setupLink: string }> {
  const input = parseInput(adminInput, raw);
  const admin = await createAdmin(db, ctx.weddingId, input);
  await logActivity(db, { ...adminLog(ctx), action: "admin_added", meta: { name: admin.name } }); // never the email in meta
  return { id: admin.id, setupLink: await adminSetupLink(admin) };
}

/** A lost or new phone. Signs them out everywhere; they sign in again after the new setup. */
export async function resetAdmin(db: Db, ctx: AdminCtx, adminId: string): Promise<{ setupLink: string }> {
  const admin = await resetAdminAuthenticator(db, ctx.weddingId, adminId);
  await logActivity(db, { ...adminLog(ctx), action: "admin_authenticator_reset", meta: { name: admin.name } });
  return { setupLink: await adminSetupLink(admin) };
}

/** Their sessions end at once: requireAdmin() finds no admin. Nobody can remove themselves. */
export async function removeAdmin(db: Db, ctx: AdminCtx, adminId: string): Promise<void> {
  if (adminId === ctx.session.adminId) throw new AppError("VALIDATION", "You can't remove yourself. Ask another admin to do it.");
  const [gone] = await db
    .delete(admins)
    .where(and(eq(admins.id, adminId), eq(admins.weddingId, ctx.weddingId)))
    .returning({ name: admins.name });
  if (!gone) throw new AppError("NOT_FOUND", "Admin not found.");
  await logActivity(db, { ...adminLog(ctx), action: "admin_removed", meta: { name: gone.name } });
}
