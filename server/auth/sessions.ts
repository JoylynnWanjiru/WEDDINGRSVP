// Admin and usher sessions (BLUEPRINT §13). These functions work on plain token
// strings; the Next.js layer only moves them in and out of HTTP-only cookies.
//
// Sessions end immediately when the secret behind them changes (BLUEPRINT D5):
// admin sessions carry a fingerprint of ADMIN_PASSWORD_HASH and the admin's
// session_version (D26), usher sessions carry usher_session_version, which is
// bumped on PIN change and "sign out all ushers".

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { admins, adminSettings } from "../db/schema";
import { AppError } from "../errors";
import { logActivity } from "../services/activity";
import { isUuid } from "./admins";
import { signJwt, verifyJwt } from "./tokens";
import { matchCode, totpSecretFor } from "./totp";

// --- password / PIN hashing (BLUEPRINT D4) ---
// scrypt with OWASP's recommended cost: N=2^17, r=8, p=1 (~128 MB, ~0.2 s).
// The parameters are stored in each hash, so they can be raised later without
// breaking existing hashes.

const SCRYPT = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 64;

function scrypt(secret: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  const maxmem = 256 * opts.N! * opts.r! + 32 * 1024 * 1024;
  return new Promise((resolve, reject) =>
    scryptCb(secret, salt, keylen, { ...opts, maxmem }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret, salt, KEY_LENGTH, SCRYPT);
  // ":" separators: "$" would be expanded as a variable when Next.js loads .env files.
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const opts = { N: Number(n), r: Number(r), p: Number(p) };
  if (![opts.N, opts.r, opts.p].every(Number.isInteger) || opts.N > 2 ** 20) return false;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length < 16) return false; // corrupted hash: refuse, don't crash
  const actual = await scrypt(secret, Buffer.from(salt, "base64url"), expected.length, opts);
  return timingSafeEqual(actual, expected);
}

const fingerprint = (value: string) => createHash("sha256").update(value).digest("base64url").slice(0, 16);

// --- admin (D26: named admins; the shared password plus each person's authenticator code) ---

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL = "7d";

export type AdminLogin = { email: string; password: string; code: string };

/**
 * Returns a session token, or null when any detail is wrong (it never says which).
 * Rate limiting is applied by the caller (E20).
 */
export async function loginAdmin(db: Db, weddingId: string, input: AdminLogin, now: Date = new Date()): Promise<string | null> {
  const stored = config.adminPasswordHash();
  if (!(await verifySecret(input.password, stored))) return null;
  const email = input.email.trim().toLowerCase();
  const [admin] = await db.select().from(admins).where(and(eq(admins.weddingId, weddingId), eq(admins.email, email)));
  if (!admin?.totpConfirmedAt) return null; // not set up yet: only the setup link works
  const step = matchCode(totpSecretFor(admin.id, admin.setupVersion), input.code, now);
  if (step === null) return null;
  // Each code works once, even when two sign-ins race with the same code.
  const used = await db
    .update(admins)
    .set({ lastTotpStep: step })
    .where(and(eq(admins.id, admin.id), or(isNull(admins.lastTotpStep), lt(admins.lastTotpStep, step))))
    .returning({ id: admins.id });
  if (!used.length) return null;
  await logActivity(db, { weddingId, actor: "admin", actorLabel: admin.name, action: "admin_signed_in" });
  return signJwt("admin", admin.id, { pf: fingerprint(stored), w: weddingId, av: admin.sessionVersion }, ADMIN_SESSION_TTL);
}

declare const adminBrand: unique symbol;

/**
 * Proof of a valid admin session. Only requireAdmin() creates one, and every
 * admin service requires it, so calling one without checking the session is a
 * compile error (BR-10). `label` is the admin's name, for the activity log.
 */
export type AdminSession = { readonly label: string; readonly adminId: string; readonly weddingId: string; readonly [adminBrand]: true };

/**
 * E24: changing ADMIN_PASSWORD_HASH ends every admin session. D26: so does removing
 * that admin or resetting their authenticator.
 */
export async function requireAdmin(db: Db, sessionToken: string | undefined | null): Promise<AdminSession> {
  const payload = sessionToken ? await verifyJwt(sessionToken, "admin") : null;
  if (payload && isUuid(payload.sub) && payload.pf === fingerprint(config.adminPasswordHash())) {
    const [a] = await db.select().from(admins).where(eq(admins.id, payload.sub));
    if (a?.totpConfirmedAt && a.weddingId === payload.w && a.sessionVersion === payload.av) {
      return { label: a.name, adminId: a.id, weddingId: a.weddingId } as AdminSession;
    }
  }
  throw new AppError("UNAUTHORIZED", "Please sign in.");
}

// --- ushers (A6: one shared PIN, each device named, e.g. "Gate 1") ---

export const USHER_COOKIE = "usher_session";
export const USHER_SESSION_TTL = "18h";

/** Setting or changing the PIN also signs out every usher (E26). */
export async function setUsherPin(db: Db, weddingId: string, pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new AppError("VALIDATION", "The PIN must be 4 to 8 digits.");
  const usherPinHash = await hashSecret(pin);
  await db
    .insert(adminSettings)
    .values({ weddingId, usherPinHash })
    .onConflictDoUpdate({
      target: adminSettings.weddingId,
      set: { usherPinHash, usherSessionVersion: sql`${adminSettings.usherSessionVersion} + 1` },
    });
}

/** E26: e.g. an usher's phone is lost on the day. */
export async function signOutAllUshers(db: Db, weddingId: string): Promise<void> {
  await db
    .update(adminSettings)
    .set({ usherSessionVersion: sql`${adminSettings.usherSessionVersion} + 1` })
    .where(eq(adminSettings.weddingId, weddingId));
}

export async function loginUsher(db: Db, weddingId: string, pin: string, device: string): Promise<string | null> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.weddingId, weddingId));
  if (!row?.usherPinHash || !(await verifySecret(pin, row.usherPinHash))) return null;
  const name = device.trim().slice(0, 40) || "Gate";
  return signJwt("usher", name, { w: weddingId, sv: row.usherSessionVersion }, USHER_SESSION_TTL);
}

declare const usherBrand: unique symbol;

/** Proof of a valid usher session; gate services require it (like AdminSession). */
export type UsherSession = { readonly device: string; readonly weddingId: string; readonly [usherBrand]: true };

export async function requireUsher(db: Db, sessionToken: string | undefined | null): Promise<UsherSession> {
  const payload = sessionToken ? await verifyJwt(sessionToken, "usher") : null;
  if (payload?.sub && typeof payload.w === "string") {
    const [row] = await db
      .select({ version: adminSettings.usherSessionVersion })
      .from(adminSettings)
      .where(eq(adminSettings.weddingId, payload.w));
    if (row && payload.sv === row.version) return { device: payload.sub, weddingId: payload.w } as UsherSession;
  }
  throw new AppError("UNAUTHORIZED", "Please enter the gate PIN.");
}
