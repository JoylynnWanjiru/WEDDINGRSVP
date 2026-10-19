import { describe, expect, it } from "vitest";
import {
  hashToken,
  inviteLink,
  inviteTokenFor,
  looksLikeInviteToken,
  signJwt,
  signPassToken,
  verifyPassToken,
} from "@/server/auth/tokens";

const ID = "6f1c9a8e-0b6e-4c4e-9d5b-3f1f2b7c9a10";

describe("invite tokens", () => {
  it("are 32 bytes base64url, stable for the same id+version, different per version", () => {
    const t1 = inviteTokenFor(ID, 1);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inviteTokenFor(ID, 1)).toBe(t1);
    expect(inviteTokenFor(ID, 2)).not.toBe(t1);
  });

  it("only the SHA-256 hash is stored, and it reveals nothing of the token", () => {
    const token = inviteTokenFor(ID, 1);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it("builds the personal link from APP_URL", () => {
    expect(inviteLink(ID, 1)).toBe(`https://wedding.test/i/${inviteTokenFor(ID, 1)}`);
  });

  it("BR-4: rejects anything not shaped like a token", () => {
    expect(looksLikeInviteToken(inviteTokenFor(ID, 1))).toBe(true);
    for (const bad of [undefined, null, "", "short", "x".repeat(44), "a".repeat(42) + "!", 42]) {
      expect(looksLikeInviteToken(bad)).toBe(false);
    }
  });
});

describe("gate-pass tokens", () => {
  const claims = { invitationId: ID, weddingId: "w-1", passVersion: 3 };

  it("round-trip without personal data inside", async () => {
    const token = await signPassToken(claims);
    expect(await verifyPassToken(token)).toEqual(claims);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["aud", "iat", "iss", "pv", "sub", "w"]);
  });

  it("reject tampered tokens", async () => {
    const token = await signPassToken(claims);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, pv: 99 })).toString("base64url");
    expect(await verifyPassToken(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifyPassToken("not-a-jwt")).toBeNull();
  });

  it("reject tokens issued for another purpose (e.g. an admin session)", async () => {
    const adminToken = await signJwt("admin", "admin", { w: "w-1", pv: 1 });
    expect(await verifyPassToken(adminToken)).toBeNull();
  });
});
