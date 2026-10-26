import { describe, expect, it } from "vitest";
import { base32, codeAt, matchCode, otpauthUri, stepAt, totpSecretFor } from "@/server/auth/totp";

// RFC 6238 appendix B (SHA-1 secret), cut to the 6 digits authenticator apps show.
const RFC_SECRET = Buffer.from("12345678901234567890");
const at = (seconds: number) => new Date(seconds * 1000);

describe("D26: authenticator codes (RFC 6238)", () => {
  it("matches the RFC test vectors", () => {
    expect(codeAt(RFC_SECRET, stepAt(at(59)))).toBe("287082");
    expect(codeAt(RFC_SECRET, stepAt(at(1111111109)))).toBe("081804");
    expect(codeAt(RFC_SECRET, stepAt(at(1234567890)))).toBe("005924");
    expect(codeAt(RFC_SECRET, stepAt(at(2000000000)))).toBe("279037");
  });

  it("encodes the secret as base32 for the app", () => {
    expect(base32(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const uri = otpauthUri(RFC_SECRET, "admin@example.com", "A & B wedding admin");
    expect(uri).toMatch(/^otpauth:\/\/totp\/A%20%26%20B%20wedding%20admin%3Aadmin%40example\.com\?/);
    expect(new URL(uri).searchParams.get("secret")).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("accepts a code for 90 seconds after it appears, plus one step of fast clock, and nothing further", () => {
    const now = at(1_800_000_000);
    const step = stepAt(now);
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step), now)).toBe(step);
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step - 2), now)).toBe(step - 2);
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step - 3), now)).toBeNull();
    expect(matchCode(RFC_SECRET, codeAt(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it("a code first shown at second 0 still works at second 89 and not at 90", () => {
    const shown = at(1_800_000_010 - (1_800_000_010 % 30)); // the start of a step
    const code = codeAt(RFC_SECRET, stepAt(shown));
    expect(matchCode(RFC_SECRET, code, new Date(shown.getTime() + 89_000))).toBe(stepAt(shown));
    expect(matchCode(RFC_SECRET, code, new Date(shown.getTime() + 90_000))).toBeNull();
  });

  it("ignores spaces and refuses anything that isn't 6 digits", () => {
    const now = at(1_800_000_000);
    const code = codeAt(RFC_SECRET, stepAt(now));
    expect(matchCode(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(stepAt(now));
    for (const bad of ["", "12345", "1234567", "abcdef", `${code}0`]) expect(matchCode(RFC_SECRET, bad, now)).toBeNull();
  });

  it("derives a different secret per admin and per setup version", () => {
    const a1 = totpSecretFor("00000000-0000-0000-0000-000000000001", 1);
    expect(a1).toHaveLength(20);
    expect(a1.equals(totpSecretFor("00000000-0000-0000-0000-000000000001", 1))).toBe(true);
    expect(a1.equals(totpSecretFor("00000000-0000-0000-0000-000000000001", 2))).toBe(false);
    expect(a1.equals(totpSecretFor("00000000-0000-0000-0000-000000000002", 1))).toBe(false);
  });
});
