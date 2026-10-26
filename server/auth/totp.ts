// Authenticator-app codes for admin sign-in (BLUEPRINT D26): RFC 6238 time-based codes,
// 6 digits every 30 seconds with SHA-1, which is what Google Authenticator, Microsoft
// Authenticator and Authy expect. Built on node:crypto, so there is no extra dependency.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

const STEP_SECONDS = 30;
const DIGITS = 6;
// A code is accepted for 90 seconds from when the app first shows it (its own 30 seconds
// plus the next two steps), so a slow typist isn't refused. One step ahead allows for a
// phone clock that runs fast.
const PAST_STEPS = 2;
const FUTURE_STEPS = 1;

/**
 * Each admin's secret is derived, never stored: HMAC(TOKEN_SECRET, admin id + setup version).
 * A database leak alone reveals no secrets, and resetting (a new setup version) makes a new one.
 */
export function totpSecretFor(adminId: string, setupVersion: number): Buffer {
  return createHmac("sha256", config.tokenSecret()).update(`totp:${adminId}:${setupVersion}`).digest().subarray(0, 20);
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding: the format authenticator apps take. */
export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export const stepAt = (now: Date) => Math.floor(now.getTime() / 1000 / STEP_SECONDS);

export function codeAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(counter).digest();
  const offset = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The time step the code belongs to, or null. Callers store the step and refuse it next
 * time, so an overheard code can't be used twice.
 */
export function matchCode(secret: Buffer, code: string, now: Date): number | null {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const current = stepAt(now);
  for (let d = -PAST_STEPS; d <= FUTURE_STEPS; d++) {
    if (timingSafeEqual(Buffer.from(codeAt(secret, current + d)), Buffer.from(typed))) return current + d;
  }
  return null;
}

/** What the setup QR code holds. The app shows "issuer (account)". */
export function otpauthUri(secret: Buffer, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: base32(secret), issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}
