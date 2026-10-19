// Invite tokens and gate-pass tokens (PROJECT_SPEC §9, §12; BLUEPRINT §14 seam).
//
// Invite token = HMAC(TOKEN_SECRET, invitation id + version), 32 bytes, base64url.
// Only its SHA-256 hash is stored, so a database leak reveals no links, yet the
// admin can rebuild any guest's link at any time. Bumping invite_token_version
// rotates one guest's link. Changing TOKEN_SECRET changes EVERY link and pass.

import { createHash, createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { config } from "../config";

const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const hmac = (purpose: string, data: string) =>
  createHmac("sha256", config.tokenSecret()).update(`${purpose}:${data}`).digest();

export function inviteTokenFor(invitationId: string, version: number): string {
  return hmac("invite", `${invitationId}:${version}`).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** BR-4: anything that isn't shaped like a token is treated as no token. */
export const looksLikeInviteToken = (token: unknown): token is string =>
  typeof token === "string" && INVITE_TOKEN_RE.test(token);

export function inviteLink(invitationId: string, version: number): string {
  return `${config.appUrl()}/i/${inviteTokenFor(invitationId, version)}`;
}

// --- signed JWTs: gate passes and sessions ---

const jwtKey = () => new Uint8Array(hmac("jwt", "v1"));
const ISSUER = "wedding-rsvp";

export async function signJwt(
  audience: string,
  subject: string,
  claims: Record<string, unknown>,
  expiresIn?: string,
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt();
  if (expiresIn) jwt.setExpirationTime(expiresIn);
  return jwt.sign(jwtKey());
}

/** Returns the payload, or null for any invalid, expired or wrong-audience token. */
export async function verifyJwt(token: string, audience: string) {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { issuer: ISSUER, audience, algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

export type PassClaims = { invitationId: string; weddingId: string; passVersion: number };

/** Gate pass: no personal data inside (§9). Validity is always re-checked live at the gate. */
export function signPassToken({ invitationId, weddingId, passVersion }: PassClaims): Promise<string> {
  return signJwt("gate-pass", invitationId, { w: weddingId, pv: passVersion });
}

export async function verifyPassToken(token: string): Promise<PassClaims | null> {
  const payload = await verifyJwt(token, "gate-pass");
  if (!payload?.sub || typeof payload.w !== "string" || typeof payload.pv !== "number") return null;
  return { invitationId: payload.sub, weddingId: payload.w, passVersion: payload.pv };
}
