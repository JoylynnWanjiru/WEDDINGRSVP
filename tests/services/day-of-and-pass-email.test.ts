// Module 6: day-of page (N2) and the QR in pass emails (D14), plus HTTP helpers.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { clientIp, errorResponse, readCookie, sessionCookie } from "@/server/http";
import { approveInvitation } from "@/server/services/admin/approvals";
import { getDayOfPage, happeningNow } from "@/server/services/day-of";
import { sendNow } from "@/server/services/messaging";
import { adminCtx } from "../helpers/admin";
import { createInvitation, createTestDb, createWedding } from "../helpers/db";
import { FakeMailer } from "../helpers/mailer";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const NOW = new Date("2026-10-25T10:00:00+03:00");
const at = (time: string) => new Date(`2026-12-12T${time}:00+03:00`);
const item = (time: string, title: string) => ({ startsAt: at(time), title, detail: null, venue: null });

describe("N2: happening now / next", () => {
  const programme = [item("13:00", "Ceremony"), item("11:30", "Gates open"), item("16:30", "Cake cutting")];

  it.each([
    ["10:00", null, "Gates open"],
    ["11:30", "Gates open", "Ceremony"],
    ["14:00", "Ceremony", "Cake cutting"],
    ["17:30", "Cake cutting", null],
    ["19:00", null, null], // more than 2 hours after the last item
  ])("at %s: now=%s, next=%s", (time, now, next) => {
    const h = happeningNow(programme, at(time));
    expect(h.now?.title ?? null).toBe(now);
    expect(h.next?.title ?? null).toBe(next);
  });

  it("the day-of page is approved-only and computes 'now' from the seeded programme", async () => {
    const wedding = await createWedding(db);
    const approved = await createInvitation(db, wedding.id, { status: "approved" });
    const page = await getDayOfPage(db, approved.token, { now: at("13:10") });
    expect(page.happening.now?.title).toBe("Wedding ceremony");
    expect(page.happening.next?.title).toBe("Cocktails & light bites");
    expect(page.programme).toHaveLength(12);
    const waiting = await createInvitation(db, wedding.id, { status: "awaiting_approval" });
    await expect(getDayOfPage(db, waiting.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("D14: the approval email carries the QR inline", () => {
  it("attaches a PNG referenced from the HTML by cid", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(db, wedding.id);
    const { invitation } = await createInvitation(db, wedding.id, { status: "awaiting_approval", email: "qr@example.com" });
    await approveInvitation(db, ctx, invitation.id, { now: NOW });
    const mailer = new FakeMailer();
    await sendNow(db, ctx, mailer, { now: NOW });
    const [email] = mailer.sent;
    expect(email.attachments).toHaveLength(1);
    const [qr] = email.attachments!;
    expect(qr).toMatchObject({ cid: "gate-pass-qr", contentType: "image/png", filename: "gate-pass.png" });
    expect(qr.content.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG signature
    expect(email.html).toContain('src="cid:gate-pass-qr"');
  });
});

describe("HTTP helpers", () => {
  it("reads cookies and builds a secure session cookie", () => {
    const req = new Request("https://x.test", { headers: { cookie: "a=1; usher_session=abc%3Ddef; b=2" } });
    expect(readCookie(req, "usher_session")).toBe("abc=def");
    expect(readCookie(req, "missing")).toBeNull();
    expect(sessionCookie("s", "v", 60)).toBe("s=v; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60");
  });

  it("takes the first forwarded IP", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }))).toBe("203.0.113.7");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });

  it("maps AppError to its status and never leaks internals", async () => {
    const res = errorResponse(new AppError("CONFLICT", "Over capacity", { overflow: 2, needsConfirmation: true, secret: "x" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "CONFLICT", message: "Over capacity", details: { overflow: 2, needsConfirmation: true } });
    const spy = console.error;
    console.error = () => {};
    const crash = errorResponse(new Error("db password is hunter2"));
    console.error = spy;
    expect(crash.status).toBe(500);
    expect(JSON.stringify(await crash.json())).not.toContain("hunter2");
  });
});
