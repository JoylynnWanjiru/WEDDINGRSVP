// Module 3: guest RSVP (BLUEPRINT §5a, BR-5 to BR-9, BR-20/21, E1, E6, E7, E14, D24).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, emailQueue, invitations, partyMembers, rsvpEvents, venues, weddings } from "@/server/db/schema";
import { requireApproved } from "@/server/services/access";
import { submitRsvp } from "@/server/services/rsvp";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-10-20T10:00:00+03:00"); // before the 14 Nov deadline
const opts = { now: NOW };

const yes = (extras: { fullName: string; isChild?: boolean }[] = [], more: Record<string, unknown> = {}) => ({
  attending: true,
  primary: { fullName: "Guest Primary" },
  extras,
  ...more,
});

async function setup(values: Parameters<typeof createInvitation>[2] = {}, weddingOpts: Parameters<typeof createWedding>[1] = {}) {
  const wedding = await createWedding(db, weddingOpts);
  const { invitation, token } = await createInvitation(db, wedding.id, { status: "sent", ...values });
  const reload = async () => (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0];
  const members = () => db.select().from(partyMembers).where(eq(partyMembers.invitationId, invitation.id));
  return { wedding, invitation, token, reload, members };
}

describe("saying Yes", () => {
  it("moves to awaiting_approval and saves the named party; nothing unlocks yet", async () => {
    const { token, reload, members } = await setup({ seatAllowance: 2 });
    const res = await submitRsvp(db, token, yes([{ fullName: "Extra One" }, { fullName: "Little One", isChild: true }]), opts);
    expect(res).toEqual({ status: "awaiting_approval", partySize: 3, awaitingApproval: true, unchanged: false });
    const inv = await reload();
    expect(inv.partySize).toBe(3);
    expect(inv.respondedAt).toEqual(NOW);
    const party = await members();
    expect(party.filter((m) => m.isPrimary)).toHaveLength(1);
    expect(party.find((m) => m.fullName === "Little One")?.isChild).toBe(true); // E25
  });

  it("BR-5: rejects more extras than the seat allowance", async () => {
    const { token, members } = await setup({ seatAllowance: 1 });
    await expect(submitRsvp(db, token, yes([{ fullName: "A" }, { fullName: "B" }]), opts)).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringMatching(/up to 1 extra guest/),
    });
    expect(await members()).toHaveLength(0);
  });

  it("BR-6: every party member needs a full name", async () => {
    const { token } = await setup({ seatAllowance: 1 });
    await expect(submitRsvp(db, token, yes([{ fullName: "  " }]), opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("records the events attended, defaulting to all of the wedding's events", async () => {
    const { wedding, token, invitation } = await setup();
    await db.insert(venues).values({ weddingId: wedding.id, kind: "reception", name: "Reception hall", sortOrder: 1 });
    await submitRsvp(db, token, yes(), opts);
    let rows = await db.select().from(rsvpEvents).where(eq(rsvpEvents.invitationId, invitation.id));
    expect(rows.map((r) => [r.event, r.attending]).sort()).toEqual([["ceremony", true], ["reception", true]]);

    await submitRsvp(db, token, yes([], { events: ["reception"] }), opts);
    rows = await db.select().from(rsvpEvents).where(eq(rsvpEvents.invitationId, invitation.id));
    expect(rows.map((r) => [r.event, r.attending]).sort()).toEqual([["ceremony", false], ["reception", true]]);
  });

  it("rejects events the wedding doesn't have, and a Yes to no events", async () => {
    const { token } = await setup();
    await expect(submitRsvp(db, token, yes([], { events: ["traditional"] }), opts)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(submitRsvp(db, token, yes([], { events: [] }), opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("D24: automatic approval", () => {
  const auto = (values: Parameters<typeof createInvitation>[2] = {}) => setup({ email: "guest@example.com", ...values }, { autoApprove: true });
  const log = (id: string) => db.select().from(activityLog).where(eq(activityLog.invitationId, id));
  const emails = (id: string) => db.select().from(emailQueue).where(eq(emailQueue.invitationId, id));

  it("a Yes within the allowance is approved at once, logged as the system, and gets the pass email instead of the receipt", async () => {
    const { invitation, token, reload } = await auto({ seatAllowance: 1 });
    const res = await submitRsvp(db, token, yes([{ fullName: "Extra One" }]), opts);
    expect(res).toEqual({ status: "approved", partySize: 2, awaitingApproval: false, unchanged: false });
    expect((await reload()).approvedAt).toEqual(NOW);
    await expect(requireApproved(db, token)).resolves.toBeTruthy(); // BR-1: details unlock straight away

    const entries = await log(invitation.id);
    expect(entries.find((e) => e.action === "rsvp_yes")?.meta).toMatchObject({ from: "sent", to: "awaiting_approval" });
    expect(entries.find((e) => e.action === "approve")).toMatchObject({ actor: "system", meta: { from: "awaiting_approval", to: "approved", auto: true } });
    expect((await emails(invitation.id)).map((e) => e.template)).toEqual(["approval_pass"]);
  });

  it("a guest who said No and changes to Yes is approved too", async () => {
    const { token } = await auto({ status: "declined" });
    expect((await submitRsvp(db, token, yes(), opts)).status).toBe("approved");
  });

  it("BR-11: a Yes that would pass the venue capacity waits for the couple", async () => {
    const { wedding, invitation, token } = await auto({ seatAllowance: 1 });
    await db.update(weddings).set({ venueCapacity: 3 }).where(eq(weddings.id, wedding.id));
    await createInvitation(db, wedding.id, { status: "approved", partySize: 2 });
    const res = await submitRsvp(db, token, yes([{ fullName: "Extra One" }]), opts);
    expect(res.status).toBe("awaiting_approval");
    expect((await emails(invitation.id)).map((e) => e.template)).toEqual(["rsvp_received"]);
    await expect(requireApproved(db, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("BR-8: adding someone after approval goes to the couple, and further edits keep it there", async () => {
    const { token } = await auto({ seatAllowance: 2 });
    expect((await submitRsvp(db, token, yes(), opts)).status).toBe("approved");
    expect((await submitRsvp(db, token, yes([{ fullName: "New Person" }]), opts)).status).toBe("awaiting_approval");
    const edited = yes([{ fullName: "New Person" }], { message: "Changed my mind about the menu" });
    expect((await submitRsvp(db, token, edited, opts)).status).toBe("awaiting_approval");
  });

  it("turned off, a Yes waits for the couple as before", async () => {
    const { token } = await setup({ seatAllowance: 0 });
    expect((await submitRsvp(db, token, yes(), opts)).status).toBe("awaiting_approval");
  });
});

describe("saying No", () => {
  it("declines, keeps only the primary guest, and can change back to Yes before the deadline", async () => {
    const { token, reload, members } = await setup({ seatAllowance: 1 });
    await submitRsvp(db, token, yes([{ fullName: "Extra One" }]), opts);
    const no = await submitRsvp(db, token, { attending: false }, opts);
    expect(no).toMatchObject({ status: "declined", partySize: 1 });
    expect((await members()).map((m) => m.fullName)).toEqual(["Guest Primary"]);
    expect((await reload()).partySize).toBe(1);
    expect((await submitRsvp(db, token, yes(), opts)).status).toBe("awaiting_approval");
  });
});

describe("BR-8: changes after approval", () => {
  async function approvedParty() {
    const s = await setup({ seatAllowance: 2 });
    await submitRsvp(db, s.token, yes([{ fullName: "Extra One" }, { fullName: "Extra Two" }]), opts);
    await db.update(invitations).set({ status: "approved" }).where(eq(invitations.id, s.invitation.id));
    return s;
  }

  it("removing a person keeps APPROVED and the same pass version; party size updates", async () => {
    const { token, reload } = await approvedParty();
    const res = await submitRsvp(db, token, yes([{ fullName: "Extra One" }]), opts);
    expect(res).toMatchObject({ status: "approved", partySize: 2, awaitingApproval: false });
    expect((await reload()).passVersion).toBe(1);
  });

  it("changing dietary details keeps APPROVED", async () => {
    const { token } = await approvedParty();
    const res = await submitRsvp(
      db,
      token,
      { attending: true, primary: { fullName: "Guest Primary", dietary: "vegan" }, extras: [{ fullName: "Extra One" }, { fullName: "Extra Two" }] },
      opts,
    );
    expect(res.status).toBe("approved");
  });

  it("E6: adding a person needs re-approval and invalidates the old pass", async () => {
    const s = await setup({ seatAllowance: 2 });
    await submitRsvp(db, s.token, yes([{ fullName: "Extra One" }]), opts);
    await db.update(invitations).set({ status: "approved" }).where(eq(invitations.id, s.invitation.id));
    const res = await submitRsvp(db, s.token, yes([{ fullName: "Extra One" }, { fullName: "Extra Two" }]), opts);
    expect(res).toMatchObject({ status: "awaiting_approval", awaitingApproval: true });
    expect((await s.reload()).passVersion).toBe(2);
  });

  it("swapping one name for another needs re-approval", async () => {
    const { token } = await approvedParty();
    const res = await submitRsvp(db, token, yes([{ fullName: "Extra One" }, { fullName: "Someone Else" }]), opts);
    expect(res.status).toBe("awaiting_approval");
  });

  it("E7: changing to No declines and invalidates the pass", async () => {
    const { token, reload } = await approvedParty();
    expect((await submitRsvp(db, token, { attending: false }, opts)).status).toBe("declined");
    expect((await reload()).passVersion).toBe(2);
  });
});

describe("BR-9 / E1: duplicate submissions", () => {
  it("an identical resubmission changes nothing and queues no second email", async () => {
    const { token, invitation, members } = await setup({ seatAllowance: 1, email: "guest@example.com" });
    const input = yes([{ fullName: "Extra One" }]);
    const first = await submitRsvp(db, token, input, opts);
    const second = await submitRsvp(db, token, input, opts);
    expect(first.unchanged).toBe(false);
    expect(second).toMatchObject({ status: "awaiting_approval", partySize: 2, unchanged: true });
    expect(await members()).toHaveLength(2);
    const emails = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));
    expect(emails).toHaveLength(1);
    const logs = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(logs).toHaveLength(1);
  });

  it("simultaneous submissions leave one consistent party", async () => {
    const { token, members } = await setup({ seatAllowance: 2 });
    await Promise.all([
      submitRsvp(db, token, yes([{ fullName: "A" }]), opts),
      submitRsvp(db, token, yes([{ fullName: "B" }, { fullName: "C" }]), opts),
    ]);
    const party = await members();
    expect([2, 3]).toContain(party.length);
    expect(party.filter((m) => m.isPrimary)).toHaveLength(1);
  });
});

describe("contact details", () => {
  it("BR-20: saves the phone in +254 format and the email", async () => {
    const { token, reload } = await setup();
    await submitRsvp(db, token, yes([], { phone: "0700 000 111", email: "guest@example.com" }), opts);
    const inv = await reload();
    expect(inv.phone).toBe("+254700000111");
    expect(inv.email).toBe("guest@example.com");
  });

  it("rejects an invalid phone or email", async () => {
    const { token } = await setup();
    await expect(submitRsvp(db, token, yes([], { phone: "12" }), opts)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(submitRsvp(db, token, yes([], { email: "not-an-email" }), opts)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("BR-21: can't take a phone number that belongs to another invitation", async () => {
    const { wedding, token } = await setup();
    await createInvitation(db, wedding.id, { phone: "+254700000222" });
    await expect(submitRsvp(db, token, yes([], { phone: "0700000222" }), opts)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("queues the 'RSVP received' email only when there is an address", async () => {
    const { token, invitation } = await setup();
    await submitRsvp(db, token, yes(), opts);
    expect(await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id))).toHaveLength(0);
    await submitRsvp(db, token, yes([], { email: "guest@example.com" }), opts);
    const [email] = await db.select().from(emailQueue).where(eq(emailQueue.invitationId, invitation.id));
    expect(email.template).toBe("rsvp_received");
  });
});

describe("who can't respond", () => {
  it("BR-7 / E14: nobody can respond after the deadline", async () => {
    const { token } = await setup();
    await expect(submitRsvp(db, token, yes(), { now: new Date("2026-11-15T00:00:00+03:00") })).rejects.toMatchObject({
      code: "DEADLINE_PASSED",
    });
  });

  it("revoked, not approved and arrived guests get a clear refusal", async () => {
    for (const [status, code] of [["revoked", "FORBIDDEN"], ["not_approved", "CONFLICT"], ["arrived", "CONFLICT"], ["partially_arrived", "CONFLICT"]] as const) {
      const { token } = await setup({ status });
      await expect(submitRsvp(db, token, yes(), opts)).rejects.toMatchObject({ code });
    }
  });

  it("BR-4: an unknown or missing token is refused", async () => {
    await expect(submitRsvp(db, undefined, yes(), opts)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(submitRsvp(db, "x".repeat(43), yes(), opts)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
