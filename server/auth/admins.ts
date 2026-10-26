// Admin accounts and authenticator setup (BLUEPRINT D26). Used by the admin service
// (Settings → Who can sign in) and by `npm run admin:add` for the very first admin.
//
// A new or reset admin gets a one-time setup link. It shows their QR code until they
// type a code back; after that, or after another reset, the link stops working.

import { and, eq, isNull, sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { admins, weddings, type Admin } from "../db/schema";
import { AppError } from "../errors";
import { signJwt, verifyJwt } from "./tokens";
import { matchCode, otpauthUri, totpSecretFor } from "./totp";

const SETUP_TTL = "72h";

/** Token subjects are checked before they reach a uuid column, which would throw. */
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function adminSetupLink(admin: Pick<Admin, "id" | "setupVersion">): Promise<string> {
  const token = await signJwt("admin-setup", admin.id, { sv: admin.setupVersion }, SETUP_TTL);
  return `${config.appUrl()}/admin/setup/${token}`;
}

/** Adds an admin who still has to set up their authenticator. Emails are unique per wedding. */
export async function createAdmin(db: Db, weddingId: string, input: { name: string; email: string }): Promise<Admin> {
  const email = input.email.trim().toLowerCase();
  const [created] = await db.insert(admins).values({ weddingId, name: input.name.trim(), email }).onConflictDoNothing().returning();
  if (!created) throw new AppError("CONFLICT", "Someone with that email can already sign in.");
  return created;
}

/** Lost phone or a new phone: a new secret, a new setup link, and every session of theirs ends. */
export async function resetAdminAuthenticator(db: Db, weddingId: string, adminId: string): Promise<Admin> {
  const [a] = await db
    .update(admins)
    .set({
      setupVersion: sql`${admins.setupVersion} + 1`,
      sessionVersion: sql`${admins.sessionVersion} + 1`,
      totpConfirmedAt: null,
      lastTotpStep: null,
    })
    .where(and(eq(admins.id, adminId), eq(admins.weddingId, weddingId)))
    .returning();
  if (!a) throw new AppError("NOT_FOUND", "Admin not found.");
  return a;
}

export type AdminSetup = { admin: Admin; secret: Buffer; uri: string };

/** The setup page's data, or null for a bad, expired, used or replaced link (BR-4: no hints). */
export async function readAdminSetup(db: Db, token: string): Promise<AdminSetup | null> {
  const payload = await verifyJwt(token, "admin-setup");
  if (!isUuid(payload?.sub) || typeof payload.sv !== "number") return null;
  const [row] = await db
    .select({ admin: admins, brideName: weddings.brideName, groomName: weddings.groomName })
    .from(admins)
    .innerJoin(weddings, eq(weddings.id, admins.weddingId))
    .where(and(eq(admins.id, payload.sub), eq(admins.setupVersion, payload.sv), isNull(admins.totpConfirmedAt)));
  if (!row) return null;
  const secret = totpSecretFor(row.admin.id, row.admin.setupVersion);
  const issuer = `${row.brideName} & ${row.groomName} wedding admin`;
  return { admin: row.admin, secret, uri: otpauthUri(secret, row.admin.email, issuer) };
}

/** The person typed a code from their app: the authenticator is now required to sign in. */
export async function confirmAdminSetup(db: Db, token: string, code: string, now: Date = new Date()): Promise<void> {
  const setup = await readAdminSetup(db, token);
  if (!setup) throw new AppError("NOT_FOUND", "This setup link has expired or was already used. Ask another admin for a new one.");
  const step = matchCode(setup.secret, code, now);
  if (step === null) throw new AppError("VALIDATION", "That code isn't right. Check your phone's clock is set automatically, then try the newest code.");
  const [done] = await db
    .update(admins)
    .set({ totpConfirmedAt: now, lastTotpStep: step })
    .where(and(eq(admins.id, setup.admin.id), eq(admins.setupVersion, setup.admin.setupVersion), isNull(admins.totpConfirmedAt)))
    .returning({ id: admins.id });
  if (!done) throw new AppError("NOT_FOUND", "This setup link has expired or was already used. Ask another admin for a new one.");
}
