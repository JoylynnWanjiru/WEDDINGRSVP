import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hashSecret,
  loginAdmin,
  loginUsher,
  requireAdmin,
  requireUsher,
  setUsherPin,
  signOutAllUshers,
  verifySecret,
} from "@/server/auth/sessions";
import { signJwt } from "@/server/auth/tokens";
import type { Db } from "@/server/db/client";
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

describe("admin session", () => {
  beforeEach(async () => {
    process.env.ADMIN_PASSWORD_HASH = await hashSecret("admin-password-123");
  });

  it("logs in with the right password and the token passes requireAdmin", async () => {
    const token = await loginAdmin("admin-password-123");
    expect(token).toBeTruthy();
    await expect(requireAdmin(token)).resolves.toEqual({ label: "admin" });
  });

  it("rejects a wrong password", async () => {
    expect(await loginAdmin("nope")).toBeNull();
  });

  it("requireAdmin rejects missing, forged and usher tokens with UNAUTHORIZED", async () => {
    const usherToken = await signJwt("usher", "Gate 1", { w: "x" });
    for (const t of [undefined, "", "forged.token.here", usherToken]) {
      await expect(requireAdmin(t)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("E24/D5: changing the password ends every existing admin session", async () => {
    const token = await loginAdmin("admin-password-123");
    process.env.ADMIN_PASSWORD_HASH = await hashSecret("a-new-password-456");
    await expect(requireAdmin(token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireAdmin(await loginAdmin("a-new-password-456"))).resolves.toBeTruthy();
  });
});

describe("usher session", () => {
  it("PIN login names the device; the token can't be used as admin", async () => {
    const wedding = await createWedding(db);
    await setUsherPin(db, wedding.id, "4821");
    expect(await loginUsher(db, wedding.id, "0000", "Gate 1")).toBeNull();
    const token = await loginUsher(db, wedding.id, "4821", "Gate 1");
    await expect(requireUsher(db, token)).resolves.toEqual({ device: "Gate 1", weddingId: wedding.id });
    await expect(requireAdmin(token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
