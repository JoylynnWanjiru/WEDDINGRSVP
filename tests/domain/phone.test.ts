import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/server/domain/phone";

describe("BR-20: phone normalisation", () => {
  it.each([
    ["0700000000", "+254700000000"],
    ["700000000", "+254700000000"],
    ["254700000000", "+254700000000"],
    ["+254700000000", "+254700000000"],
    ["00254700000000", "+254700000000"],
    ["0700 000 000", "+254700000000"],
    ["(0700)-000-000", "+254700000000"],
    ["0110000000", "+254110000000"],
    ["+254 110 000000", "+254110000000"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps non-Kenyan international numbers (E15 guests abroad)", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("001 202 555 0143")).toBe("+12025550143");
  });

  it.each(["", "   ", "abc", "0812345678", "07123", "+254812345678", "07000000009", "+0123456789", "+12345"])(
    "rejects %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});
