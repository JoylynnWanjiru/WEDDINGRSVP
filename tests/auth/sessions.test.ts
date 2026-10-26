import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminSetupLink, confirmAdminSetup, createAdmin, readAdminSetup, resetAdminAuthenticator } from "@/server/auth/admins";
import {
  hashSecret,
  loginAdmin,
  loginUsher,
  requireAdmin,
  requireUsher,
  setUsherPin,
  signOutAllUshers,
  verifySecret,
  type AdminLogin,
} from "@/server/auth/sessions";
import { signJwt } from "@/server/auth/tokens";
import { codeAt, stepAt, totpSecretFor } from "@/server/auth/totp";
import type { Db } from "@/server/db/client";
import { activityLog, type Admin } from "@/server/db/schema";
import { setupToken } from "../helpers/admin";
import { createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("D4: secret hashing", () => {
  it("uses OWASP scrypt cost and stores the parameters in the hash", async () => {
    const stored = await hashSecret("correct horse battery");
    expect(stored).toMatch(/^scrypt:131072:8:1:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain("$"); // "$" would be expanded when Next.js loads .env files
    expect(await verifySecret("correct horse battery", stored)).toBe(true);
    expect(await verifySecret("wrong", stored)).toBe(false);
  });

  it("salts every hash and rejects malformed or absurd-cost hashes", async () => {
    expect(await hashSecret("same")).not.toBe(await hashSecret("same"));
    expect(await verifySecret("x", "garbage")).toBe(false);
    expect(await verifySecret("x", "scrypt:abc:8:1:c2FsdA:aGFzaA")).toBe(false);
    expect(await verifySecret("x", `scrypt:${2 ** 24}:8:1:c2FsdA:aGFzaA`)).toBe(false);
    expect(await verifySecret("x", "scrypt:131072:8:1:c2FsdA:")).toBe(false);
    expect(await verifySecret("x", "scrypt:131072:8:1:c2FsdA:aGFzaA")).toBe(false); // truncated hash
  });
});

describe("admin session (D26: email + password + authenticator code)", () => {
  const PASSWORD = "admin-password-123";
  const EMAIL = "planner@example.com";
  let wedding: { id: string };
  let admin: Admin;
  let secret: Buffer;
  // Each sign-in uses a later code than the last: a code works once.
  let clock = new Date("2026-11-01T09:00:00Z").getTime();
  const tick = () => new Date((clock += 30_000));
  const login = (over: Partial<AdminLogin> = {}, now = tick()) =>
    loginAdmin(db, wedding.id, { email: EMAIL, password: PASSWORD, code: codeAt(secret, stepAt(now)), ...over }, now);

  beforeEach(async () => {
    process.env.ADMIN_PASSWORD_HASH = await hashSecret(PASSWORD);
    wedding = await createWedding(db);
    admin = await createAdmin(db, wedding.id, { name: "The Planner", email: EMAIL });
    secret = totpSecretFor(admin.id, admin.setupVersion);
    const now = tick();
    await confirmAdminSetup(db, setupToken(await adminSetupLink(admin)), codeAt(secret, stepAt(now)), now);
  });

  it("signs in with all three and the session names the admin", async () => {
    const token = await login();
    await expect(requireAdmin(db, token)).resolves.toEqual({ label: "The Planner", adminId: admin.id, weddingId: wedding.id });
    const [log] = await db.select().from(activityLog).where(and(eq(activityLog.weddingId, wedding.id), eq(activityLog.action, "admin_signed_in")));
    expect(log).toMatchObject({ actor: "admin", actorLabel: "The Planner" });
  });

  it("refuses a wrong password, an unknown email or a wrong code, without saying which", async () => {
    expect(await login({ password: "nope" })).toBeNull();
    expect(await login({ email: "stranger@example.com" })).toBeNull();
    expect(await login({ code: "000000" })).toBeNull();
    expect(await login({ email: ` ${EMAIL.toUpperCase()} ` })).toBeTruthy(); // case and spaces don't matter
  });

  it("a code works once, even when two sign-ins race with it", async () => {
    const now = tick();
    const code = codeAt(secret, stepAt(now));
    const results = await Promise.all([login({ code }, now), login({ code }, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await login({ code }, now)).toBeNull();
  });

  it("an admin who hasn't finished setup can't sign in", async () => {
    const pending = await createAdmin(db, wedding.id, { name: "New Person", email: "new@example.com" });
    const s = totpSecretFor(pending.id, pending.setupVersion);
    const now = tick();
    expect(await loginAdmin(db, wedding.id, { email: "new@example.com", password: PASSWORD, code: codeAt(s, stepAt(now)) }, now)).toBeNull();
  });

  it("an admin of one wedding can't sign in to another", async () => {
    const other = await createWedding(db);
    const now = tick();
    expect(await loginAdmin(db, other.id, { email: EMAIL, password: PASSWORD, code: codeAt(secret, stepAt(now)) }, now)).toBeNull();
  });

  it("requireAdmin rejects missing, forged, usher and old shared-login tokens with UNAUTHORIZED", async () => {
    const usherToken = await signJwt("usher", "Gate 1", { w: "x" });
    const oldShared = await signJwt("admin", "admin", { pf: "x" }); // before D26
    for (const t of [undefined, "", "forged.token.here", usherToken, oldShared]) {
      await expect(requireAdmin(db, t)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("E24/D5: changing the password ends every existing admin session", async () => {
    const token = await login();
    process.env.ADMIN_PASSWORD_HASH = await hashSecret("a-new-password-456");
    await expect(requireAdmin(db, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireAdmin(db, await login({ password: "a-new-password-456" }))).resolves.toBeTruthy();
  });

  it("E28: resetting the authenticator ends their sessions; the old phone's codes stop working", async () => {
    const token = await login();
    const oldLink = await adminSetupLink(admin);
    const reset = await resetAdminAuthenticator(db, wedding.id, admin.id);
    await expect(requireAdmin(db, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await login()).toBeNull(); // old secret, and not set up again yet
    expect(await readAdminSetup(db, setupToken(oldLink))).toBeNull();

    secret = totpSecretFor(reset.id, reset.setupVersion);
    const now = tick();
    await confirmAdminSetup(db, setupToken(await adminSetupLink(reset)), codeAt(secret, stepAt(now)), now);
    await expect(requireAdmin(db, await login())).resolves.toMatchObject({ adminId: admin.id });
  });
});

describe("D26: authenticator setup link", () => {
  beforeEach(async () => {
    process.env.ADMIN_PASSWORD_HASH = await hashSecret("admin-password-123");
  });

  it("shows the QR code until a right code is typed, then stops working", async () => {
    const wedding = await createWedding(db);
    const admin = await createAdmin(db, wedding.id, { name: "Bride", email: "bride@example.com" });
    const token = setupToken(await adminSetupLink(admin));
    const setup = await readAdminSetup(db, token);
    expect(setup?.admin.id).toBe(admin.id);
    expect(setup?.uri).toContain("otpauth://totp/");

    const now = new Date("2026-11-01T09:00:00Z");
    await expect(confirmAdminSetup(db, token, "000000", now)).rejects.toMatchObject({ code: "VALIDATION" });
    await confirmAdminSetup(db, token, codeAt(setup!.secret, stepAt(now)), now);
    expect(await readAdminSetup(db, token)).toBeNull();
    await expect(confirmAdminSetup(db, token, codeAt(setup!.secret, stepAt(now) + 1), now)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("BR-4: a forged, wrong-audience or expired link shows nothing", async () => {
    const wedding = await createWedding(db);
    const admin = await createAdmin(db, wedding.id, { name: "Groom", email: "groom@example.com" });
    for (const t of [
      "forged.token.here",
      await signJwt("admin", admin.id, { sv: 1 }),
      await signJwt("admin-setup", "not-a-uuid", { sv: 1 }),
      await signJwt("admin-setup", admin.id, { sv: 1 }, "-1s"),
    ]) {
      expect(await readAdminSetup(db, t)).toBeNull();
    }
  });
});

describe("usher session", () => {
  it("PIN login names the device; the token can't be used as admin", async () => {
    const wedding = await createWedding(db);
    await setUsherPin(db, wedding.id, "4821");
    expect(await loginUsher(db, wedding.id, "0000", "Gate 1")).toBeNull();
    const token = await loginUsher(db, wedding.id, "4821", "Gate 1");
    await expect(requireUsher(db, token)).resolves.toEqual({ device: "Gate 1", weddingId: wedding.id });
    await expect(requireAdmin(db, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("no PIN set means nobody can log in", async () => {
    const wedding = await createWedding(db);
    expect(await loginUsher(db, wedding.id, "1234", "Gate 1")).toBeNull();
  });

  it("rejects PINs that aren't 4–8 digits", async () => {
    const wedding = await createWedding(db);
    await expect(setUsherPin(db, wedding.id, "12")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setUsherPin(db, wedding.id, "abcd")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("E26/D5: changing the PIN signs out every usher", async () => {
    const wedding = await createWedding(db);
    await setUsherPin(db, wedding.id, "4821");
    const token = await loginUsher(db, wedding.id, "4821", "Gate 1");
    await setUsherPin(db, wedding.id, "7350");
    await expect(requireUsher(db, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await loginUsher(db, wedding.id, "4821", "Gate 1")).toBeNull();
  });

  it("E26/D5: 'sign out all ushers' works without changing the PIN", async () => {
    const wedding = await createWedding(db);
    await setUsherPin(db, wedding.id, "4821");
    const before = await loginUsher(db, wedding.id, "4821", "Gate 1");
    await signOutAllUshers(db, wedding.id);
    await expect(requireUsher(db, before)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const after = await loginUsher(db, wedding.id, "4821", "Gate 1");
    await expect(requireUsher(db, after)).resolves.toMatchObject({ device: "Gate 1" });
  });
});
