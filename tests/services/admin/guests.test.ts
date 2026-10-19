// Module 4: the guest list (U1, U3, BR-7, BR-12, BR-20, BR-21, E14, E21, E27).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activityLog, invitations } from "@/server/db/schema";
import { getAccess } from "@/server/services/access";
import {
  addInvitation,
  getInvitationDetail,
  getInviteLink,
  importInvitations,
  listInvitations,
  previewInvitation,
  recordRsvpForGuest,
  rotateInviteLink,
  updateInvitation,
} from "@/server/services/admin/guests";
import { recordView } from "@/server/services/invitation-page";
import { submitRsvp } from "@/server/services/rsvp";
import { adminCtx } from "../../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

async function setup() {
  const wedding = await createWedding(db);
  const ctx = await adminCtx(wedding.id);
  const reload = async (id: string) => (await db.select().from(invitations).where(eq(invitations.id, id)))[0];
  return { wedding, ctx, reload };
}

const tokenFromLink = (link: string) => link.split("/i/")[1];

describe("addInvitation", () => {
  it("adds a draft guest with a normalised phone and the default seat allowance (A2)", async () => {
    const { ctx, reload } = await setup();
    const { id } = await addInvitation(db, ctx, { fullName: "Wanjiru Kamau", phone: "0700 000 701", group: "Friends", side: "bride" });
    expect(await reload(id)).toMatchObject({ status: "draft", phone: "+254700000701", seatAllowance: 0, source: "admin", group: "Friends" });
  });

  it("BR-21: a duplicate phone points to the existing guest", async () => {
    const { ctx } = await setup();
    const { id } = await addInvitation(db, ctx, { fullName: "First", phone: "0700000702" });
    await expect(addInvitation(db, ctx, { fullName: "Second", phone: "+254 700 000 702" })).rejects.toMatchObject({
      code: "CONFLICT",
      details: { existingInvitationId: id },
    });
  });

  it("validates input", async () => {
    const { ctx } = await setup();
    await expect(addInvitation(db, ctx, { fullName: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addInvitation(db, ctx, { fullName: "X", phone: "12" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addInvitation(db, ctx, { fullName: "X", seatAllowance: -1 })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("importInvitations", () => {
  const CSV = [
    "full_name,phone,email,group,side,seat_allowance",
    "Guest One,0700000711,one@example.com,Friends,bride,1",
    '"Kamau, Wanjiru",0700000712,,Family,Groom,',
    "Bad Phone,12,,,,",
    "Dup In File,0700000711,,,,",
    "Already Invited,0700000799,,,,",
    ",0700000713,,,,",
    "No Phone,,three@example.com,,,2",
  ].join("\n");

  it("dry run previews without saving", async () => {
    const { wedding, ctx } = await setup();
    await createInvitation(db, wedding.id, { phone: "+254700000799" });
    const res = await importInvitations(db, ctx, CSV, { dryRun: true });
    expect(res).toMatchObject({ created: 3, dryRun: true });
    expect(await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id))).toHaveLength(1);
  });

  it("creates valid rows and reports every skipped row with its line number", async () => {
    const { wedding, ctx } = await setup();
    await createInvitation(db, wedding.id, { phone: "+254700000799" });
    const res = await importInvitations(db, ctx, CSV);
    expect(res.created).toBe(3);
    expect(res.skipped.map((s) => s.row)).toEqual([4, 5, 6, 7]);
    expect(res.skipped[1].reason).toMatch(/already on the guest list/);
    const rows = await db.select().from(invitations).where(eq(invitations.weddingId, wedding.id));
    const kamau = rows.find((r) => r.fullName === "Kamau, Wanjiru");
    expect(kamau).toMatchObject({ phone: "+254700000712", side: "groom", seatAllowance: 0, source: "import" });
    expect(rows.find((r) => r.fullName === "No Phone")?.seatAllowance).toBe(2);
  });

  it("rejects a file without the header row", async () => {
    const { ctx } = await setup();
    await expect(importInvitations(db, ctx, "Guest One,0700000711\n")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("updateInvitation", () => {
  it("E21: a stale edit is refused instead of overwriting", async () => {
    const { wedding, ctx, reload } = await setup();
    const { invitation } = await createInvitation(db, wedding.id);
    const loaded = invitation.updatedAt;
    const first = await updateInvitation(db, ctx, invitation.id, { notes: "first" }, loaded);
    await expect(updateInvitation(db, ctx, invitation.id, { notes: "second" }, loaded)).rejects.toMatchObject({ code: "CONFLICT" });
    await updateInvitation(db, ctx, invitation.id, { notes: "second" }, first.updatedAt);
    expect((await reload(invitation.id)).notes).toBe("second");
  });

  it("BR-12: the seat allowance can't go below the extras already named", async () => {
    const { wedding, ctx } = await setup();
    const { invitation } = await createInvitation(db, wedding.id, { seatAllowance: 3, partySize: 3 });
    await expect(updateInvitation(db, ctx, invitation.id, { seatAllowance: 1 }, invitation.updatedAt)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(updateInvitation(db, ctx, invitation.id, { seatAllowance: 2 }, invitation.updatedAt)).resolves.toBeTruthy();
  });

  it("normalises a new phone, refuses another guest's phone, and null clears a field", async () => {
    const { wedding, ctx, reload } = await setup();
    await createInvitation(db, wedding.id, { phone: "+254700000721" });
    const { invitation } = await createInvitation(db, wedding.id, { email: "old@example.com" });
    await expect(updateInvitation(db, ctx, invitation.id, { phone: "0700000721" }, invitation.updatedAt)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await updateInvitation(db, ctx, invitation.id, { phone: "0700000722", email: null }, invitation.updatedAt);
    expect(await reload(invitation.id)).toMatchObject({ phone: "+254700000722", email: null });
  });

  it("logs field names only, never values", async () => {
    const { wedding, ctx } = await setup();
    const { invitation } = await createInvitation(db, wedding.id);
    await updateInvitation(db, ctx, invitation.id, { phone: "0700000723" }, invitation.updatedAt);
    const [log] = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(log.meta).toEqual({ fields: ["phone"] });
  });
});

describe("links", () => {
  it("getInviteLink returns the guest's working link", async () => {
    const { wedding, ctx } = await setup();
    const { invitation, token } = await createInvitation(db, wedding.id);
    expect(await getInviteLink(db, ctx, invitation.id)).toBe(`https://wedding.test/i/${token}`);
  });

  it("rotateInviteLink kills the old link and the new one works", async () => {
    const { wedding, ctx } = await setup();
    const { invitation, token } = await createInvitation(db, wedding.id, { status: "approved" });
    const link = await rotateInviteLink(db, ctx, invitation.id);
    expect((await getAccess(db, token)).level).toBe("public");
    expect((await getAccess(db, tokenFromLink(link))).level).toBe("approved");
  });
});

describe("list and detail", () => {
  it("filters by status, group and search (name, email, any phone format)", async () => {
    const { wedding, ctx } = await setup();
    await createInvitation(db, wedding.id, { fullName: "Akinyi Otieno", group: "Work", status: "sent", phone: "+254700000731" });
    await createInvitation(db, wedding.id, { fullName: "Baraka Mwangi", group: "Family", status: "approved", email: "baraka@example.com" });
    await createInvitation(db, wedding.id, { fullName: "Chebet Kiprop", group: "Family", status: "declined", respondedAt: new Date() });
    const names = async (f: Parameters<typeof listInvitations>[2]) => (await listInvitations(db, ctx, f)).map((r) => r.fullName);
    expect(await names({ status: "approved" })).toEqual(["Baraka Mwangi"]);
    expect(await names({ group: "Family" })).toEqual(["Baraka Mwangi", "Chebet Kiprop"]);
    expect(await names({ search: "otieno" })).toEqual(["Akinyi Otieno"]);
    expect(await names({ search: "BARAKA@example" })).toEqual(["Baraka Mwangi"]);
    expect(await names({ search: "0700 000 731" })).toEqual(["Akinyi Otieno"]);
    expect(await names({ notViewed: true })).toEqual(["Akinyi Otieno", "Baraka Mwangi", "Chebet Kiprop"]);
    expect(await names({ noResponse: true })).toEqual(["Akinyi Otieno", "Baraka Mwangi"]);
    expect(await names({ search: "%" })).toEqual([]); // wildcards are literal
  });

  it("detail shows party, link and a timeline of what happened", async () => {
    const { wedding, ctx } = await setup();
    const { invitation, token } = await createInvitation(db, wedding.id, { status: "sent", seatAllowance: 1 });
    await recordView(db, token, { viewer: "guest" });
    await submitRsvp(db, token, { attending: true, primary: { fullName: "Main Guest" }, extras: [{ fullName: "Plus One" }] }, { now: new Date("2026-10-20T10:00:00+03:00") });
    const d = await getInvitationDetail(db, ctx, invitation.id);
    expect(d.party.map((p) => p.fullName)).toEqual(["Main Guest", "Plus One"]);
    expect(d.link).toBe(`https://wedding.test/i/${token}`);
    expect(d.timeline.map((t) => t.action)).toEqual(["rsvp_yes", "viewed"]);
  });
});

describe("preview and admin RSVP", () => {
  it("E27: previewing shows the guest's page without recording a view", async () => {
    const { wedding, ctx, reload } = await setup();
    const { invitation } = await createInvitation(db, wedding.id, { status: "sent", fullName: "Peek Guest" });
    const page = await previewInvitation(db, ctx, invitation.id);
    expect(page).toMatchObject({ level: "invited", guest: { firstName: "Peek" } });
    expect(await reload(invitation.id)).toMatchObject({ status: "sent", viewCount: 0 });
  });

  it("BR-7 / E14: the couple can record a response after the deadline, logged as admin", async () => {
    const { wedding, ctx } = await setup();
    const { invitation } = await createInvitation(db, wedding.id, { status: "sent" });
    const res = await recordRsvpForGuest(db, ctx, invitation.id, { attending: true, primary: { fullName: "Late Guest" } }, { now: new Date("2026-12-01T10:00:00+03:00") });
    expect(res.status).toBe("awaiting_approval");
    const [log] = await db.select().from(activityLog).where(eq(activityLog.invitationId, invitation.id));
    expect(log).toMatchObject({ actor: "admin", action: "rsvp_yes" });
  });
});
