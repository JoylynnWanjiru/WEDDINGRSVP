// Admin and usher sessions (BLUEPRINT §13). These functions work on plain token
// strings; the Next.js layer only moves them in and out of HTTP-only cookies.
//
// Sessions end immediately when the secret behind them changes (BLUEPRINT D5):
// admin sessions carry a fingerprint of ADMIN_PASSWORD_HASH, usher sessions carry
// usher_session_version, which is bumped on PIN change and "sign out all ushers".

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { adminSettings } from "../db/schema";
import { AppError } from "../errors";
import { signJwt, verifyJwt } from "./tokens";

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

// --- admin (A5: couple and planner share one login in v1) ---

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL = "7d";

/** Returns a session token on success. Rate limiting is applied by the caller (E20). */
export async function loginAdmin(password: string): Promise<string | null> {
  const stored = config.adminPasswordHash();
  if (!(await verifySecret(password, stored))) return null;
  return signJwt("admin", "admin", { pf: fingerprint(stored) }, ADMIN_SESSION_TTL);
}

declare const adminBrand: unique symbol;

/**
 * Proof of a valid admin session. Only requireAdmin() creates one, and every
 * admin service requires it, so calling one without checking the session is a
 * compile error (BR-10).
 */
export type AdminSession = { readonly label: string; readonly [adminBrand]: true };

/** E24: changing ADMIN_PASSWORD_HASH ends every existing admin session. */
export async function requireAdmin(sessionToken: string | undefined | null): Promise<AdminSession> {
  const payload = sessionToken ? await verifyJwt(sessionToken, "admin") : null;
  if (!payload || payload.pf !== fingerprint(config.adminPasswordHash())) {
    throw new AppError("UNAUTHORIZED", "Please sign in.");
  }
  return { label: "admin" } as AdminSession;
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
