import { describe, expect, it } from "vitest";
import {
  assertAllowanceCoversParty,
  assertPartyWithinAllowance,
  capacityOverflow,
  isRsvpOpen,
  partyNeedsReapproval,
} from "@/server/domain/rules";

describe("BR-5: seat allowance", () => {
  it("allows extras up to the allowance", () => {
    expect(() => assertPartyWithinAllowance(0, 0)).not.toThrow();
    expect(() => assertPartyWithinAllowance(2, 2)).not.toThrow();
  });

  it("rejects extras over the allowance with a clear message", () => {
    expect(() => assertPartyWithinAllowance(1, 0)).toThrow(/for you only/);
    expect(() => assertPartyWithinAllowance(3, 2)).toThrow(/up to 2 extra guests/);
  });
});

describe("BR-7: RSVP deadline", () => {
  const deadline = new Date("2026-11-14T23:59:59+03:00");
  it("is open up to and including the deadline", () => {
    expect(isRsvpOpen(deadline, new Date("2026-11-14T23:59:59+03:00"))).toBe(true);
    expect(isRsvpOpen(deadline, new Date("2026-11-15T00:00:00+03:00"))).toBe(false);
  });
});

describe("BR-8: when a party change needs re-approval", () => {
  const approved = [{ fullName: "Wanjiru Kamau" }, { fullName: "Otieno Kamau" }];

  it("removing people or changing details does not", () => {
    expect(partyNeedsReapproval(approved, [{ fullName: "Wanjiru Kamau" }])).toBe(false);
    expect(partyNeedsReapproval(approved, [{ fullName: " wanjiru  KAMAU " }, { fullName: "Otieno Kamau" }])).toBe(false);
  });

  it("adding a person does", () => {
    expect(partyNeedsReapproval(approved, [...approved, { fullName: "Akinyi Kamau" }])).toBe(true);
  });

  it("swapping one name for another does (a new person at the gate)", () => {
    expect(partyNeedsReapproval(approved, [{ fullName: "Wanjiru Kamau" }, { fullName: "Someone Else" }])).toBe(true);
  });

  it("adding a second person with the same name does", () => {
    expect(partyNeedsReapproval([{ fullName: "A B" }], [{ fullName: "A B" }, { fullName: "A B" }])).toBe(true);
  });
});

describe("BR-11: capacity warning", () => {
  it("returns the overflow, or 0 when within capacity / no capacity set", () => {
    expect(capacityOverflow(298, 3, 300)).toBe(1);
    expect(capacityOverflow(290, 3, 300)).toBe(0);
    expect(capacityOverflow(1000, 3, null)).toBe(0);
  });
});

describe("BR-12: reducing the allowance", () => {
  it("is blocked below the current number of extras", () => {
    expect(() => assertAllowanceCoversParty(1, 2)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(() => assertAllowanceCoversParty(2, 2)).not.toThrow();
    expect(() => assertAllowanceCoversParty(-1, 0)).toThrow();
  });
});
