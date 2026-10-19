import { describe, expect, it } from "vitest";
import {
  INVITATION_STATUSES,
  isUnlocked,
  nextRequestStatus,
  nextStatus,
  type InvitationStatus,
} from "@/server/domain/status";

const all = INVITATION_STATUSES;
const allowedFrom = (action: Parameters<typeof nextStatus>[1]) =>
  all.filter((s) => {
    try {
      nextStatus(s, action);
      return true;
    } catch {
      return false;
    }
  });

describe("BR-1: unlocked states", () => {
  it("only approved, partially_arrived and arrived unlock content", () => {
    expect(all.filter(isUnlocked)).toEqual(["approved", "partially_arrived", "arrived"]);
  });

  it("D2: there is no 'pass issued' status: delivery is tracked as timestamps", () => {
    expect(all).not.toContain("pass_issued");
  });
});

describe("§5a invitation lifecycle", () => {
  it("send moves draft → sent and keeps later states (re-send)", () => {
    expect(nextStatus("draft", { type: "send" })).toBe("sent");
    expect(nextStatus("viewed", { type: "send" })).toBe("viewed");
    expect(nextStatus("approved", { type: "send" })).toBe("approved");
    expect(() => nextStatus("revoked", { type: "send" })).toThrow();
  });

  it("view moves draft/sent → viewed and leaves later states alone", () => {
    expect(nextStatus("sent", { type: "view" })).toBe("viewed");
    expect(nextStatus("draft", { type: "view" })).toBe("viewed");
    expect(nextStatus("approved", { type: "view" })).toBe("approved");
    expect(nextStatus("revoked", { type: "view" })).toBe("revoked");
  });

  it("saying Yes never unlocks: it goes to awaiting_approval", () => {
    for (const s of ["draft", "sent", "viewed", "declined", "awaiting_approval"] as const) {
      expect(nextStatus(s, { type: "respond_yes", partyGrew: false })).toBe("awaiting_approval");
    }
  });

  it("BR-8: approved guests stay approved unless the party grew", () => {
    expect(nextStatus("approved", { type: "respond_yes", partyGrew: false })).toBe("approved");
    expect(nextStatus("approved", { type: "respond_yes", partyGrew: true })).toBe("awaiting_approval");
  });

  it("guests can't respond once arrived, revoked or not approved", () => {
    const blocked: InvitationStatus[] = ["not_approved", "partially_arrived", "arrived", "revoked"];
    for (const s of blocked) {
      expect(() => nextStatus(s, { type: "respond_yes", partyGrew: false })).toThrow();
      expect(() => nextStatus(s, { type: "respond_no" })).toThrow();
    }
  });

  it("E7: an approved guest changing to No becomes declined", () => {
    expect(nextStatus("approved", { type: "respond_no" })).toBe("declined");
  });

  it("approval is only from awaiting_approval (never automatic)", () => {
    expect(allowedFrom({ type: "approve" })).toEqual(["awaiting_approval"]);
    expect(nextStatus("awaiting_approval", { type: "decline_attendance" })).toBe("not_approved");
    expect(nextStatus("not_approved", { type: "reopen" })).toBe("awaiting_approval");
  });

  it("BR-13/16: admit from approved or partially_arrived, whether or not the pass was emailed", () => {
    expect(nextStatus("approved", { type: "admit", arrivedAfter: 2, partySize: 3 })).toBe("partially_arrived");
    expect(nextStatus("approved", { type: "admit", arrivedAfter: 3, partySize: 3 })).toBe("arrived");
    expect(nextStatus("partially_arrived", { type: "admit", arrivedAfter: 3, partySize: 3 })).toBe("arrived");
    expect(allowedFrom({ type: "admit", arrivedAfter: 1, partySize: 1 })).toEqual(["approved", "partially_arrived"]);
  });

  it("revoke from any state except arrived; restore returns the previous state (E22)", () => {
    expect(allowedFrom({ type: "revoke" })).toEqual(all.filter((s) => s !== "arrived" && s !== "revoked"));
    expect(nextStatus("revoked", { type: "restore", previous: "approved" })).toBe("approved");
    expect(() => nextStatus("revoked", { type: "restore", previous: null })).toThrow();
    expect(() => nextStatus("approved", { type: "restore", previous: "draft" })).toThrow();
  });

  it("invalid transitions throw INVALID_TRANSITION", () => {
    expect(() => nextStatus("draft", { type: "approve" })).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });
});

describe("§5b request lifecycle", () => {
  it("pending → accepted | rejected; rejected can be reopened", () => {
    expect(nextRequestStatus("pending", { type: "accept" })).toBe("accepted");
    expect(nextRequestStatus("pending", { type: "reject" })).toBe("rejected");
    expect(nextRequestStatus("rejected", { type: "reopen" })).toBe("pending");
  });

  it("an accepted request is final", () => {
    for (const type of ["accept", "reject", "reopen"] as const) {
      expect(() => nextRequestStatus("accepted", { type })).toThrow();
    }
  });
});
