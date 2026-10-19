import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashClientId, hitRateLimit, rateLimitKey } from "@/server/auth/rate-limit";
import type { Db } from "@/server/db/client";
import { createTestDb } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("E19/E20: rate limiting", () => {
  it("allows up to the limit, then blocks", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(db, "login:203.0.113.1", 3, 60, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
  });

  it("resets after the window", async () => {
    const t0 = new Date("2026-10-20T10:00:00Z");
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "login:203.0.113.2", 3, 60, t0);
    expect((await hitRateLimit(db, "login:203.0.113.2", 3, 60, new Date(t0.getTime() + 30_000))).allowed).toBe(false);
    const later = await hitRateLimit(db, "login:203.0.113.2", 3, 60, new Date(t0.getTime() + 61_000));
    expect(later).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("counts concurrent hits atomically", async () => {
    const now = new Date("2026-10-20T11:00:00Z");
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(db, "burst", 5, 60, now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("keys never contain the raw IP, and differ per kind and per IP", () => {
    const key = rateLimitKey("adminLogin", "203.0.113.10");
    expect(key).toMatch(/^adminLogin:[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain("203.0.113");
    expect(rateLimitKey("adminLogin", "203.0.113.10")).toBe(key);
    expect(rateLimitKey("publicRequest", "203.0.113.10")).not.toBe(key);
    expect(rateLimitKey("adminLogin", "203.0.113.11")).not.toBe(key);
    expect(hashClientId("203.0.113.10")).not.toContain("203.0.113");
  });

  it("keeps keys independent", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    await hitRateLimit(db, "a", 1, 60, now);
    expect((await hitRateLimit(db, "b", 1, 60, now)).allowed).toBe(true);
  });
});
