// Admin request context: proof of a valid session plus the wedding it acts on.
// Every admin service takes an AdminCtx and scopes every query to ctx.weddingId.

import { eq } from "drizzle-orm";
import { requireAdmin, type AdminSession } from "../../auth/sessions";
import type { Db } from "../../db/client";
import { weddings, type Wedding } from "../../db/schema";
import { AppError } from "../../errors";
import type { ActorRef } from "../transitions";

export type AdminCtx = { readonly session: AdminSession; readonly weddingId: string };

/** HTTP adapters call this with the session cookie and the configured wedding slug. */
export async function getAdminContext(db: Db, sessionToken: string | null | undefined, weddingSlug: string): Promise<AdminCtx> {
  const session = await requireAdmin(db, sessionToken);
  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, weddingSlug));
  if (!w) throw new AppError("NOT_FOUND", "Wedding not found.");
  if (w.id !== session.weddingId) throw new AppError("UNAUTHORIZED", "Please sign in."); // D26: admins belong to one wedding
  return { session, weddingId: w.id };
}

/** For applyTransition(). */
export const adminActor = (ctx: AdminCtx): ActorRef => ({ actor: "admin", label: ctx.session.label });

/** For logActivity() entries written directly by admin services. */
export const adminLog = (ctx: AdminCtx) => ({ weddingId: ctx.weddingId, actor: "admin" as const, actorLabel: ctx.session.label });

export async function loadWedding(db: Db, ctx: AdminCtx): Promise<Wedding> {
  const [w] = await db.select().from(weddings).where(eq(weddings.id, ctx.weddingId));
  if (!w) throw new AppError("NOT_FOUND", "Wedding not found.");
  return w;
}
