// Usage: npm run access:check                        against APP_URL (the dev server)
//        npm run access:check -- https://<site>       against a deployed site
// Phase 6 access test (spec §4a, BLUEPRINT BR-1 to BR-4, §15): talks to a RUNNING site
// over plain HTTP, the way a stranger with a forwarded link would, with no cookies.
// It creates a throwaway wedding whose locked content carries unique marker words,
// one guest in every status, then checks each page and route shows only what it should.
// The throwaway wedding is deleted at the end. Cron routes are left out on purpose:
// if their check ever broke, calling them would send real emails or delete data
// (their auth is covered by tests/services/reminders-whatsapp-cron.test.ts).
// The deployed site must share this DATABASE_URL and TOKEN_SECRET.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ADMIN_COOKIE, USHER_COOKIE } from "../server/auth/sessions";
import { hashToken, inviteTokenFor } from "../server/auth/tokens";
import { config } from "../server/config";
import { getDb } from "../server/db/client";
import { contacts, dressCode, faqItems, invitations, partyMembers, photos, programmeItems, venues, weddings } from "../server/db/schema";
import { seedWedding } from "../server/db/seed";
import type { InvitationStatus } from "../server/domain/status";
import { passTokenFor } from "../server/services/gate";

let failures = 0;
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n      ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Got = { status: number; location: string | null; robots: string | null; body: string };

async function main() {
  for (const name of ["DATABASE_URL", "TOKEN_SECRET", "APP_URL"]) {
    if (!process.env[name]) {
      console.error(`${name} is missing from .env.local (see docs/SETUP.md).`);
      process.exit(1);
    }
  }
  const base = (process.argv[2] ?? config.appUrl()).replace(/\/$/, "");
  const db = getDb();

  async function get(path: string, init: RequestInit = {}): Promise<Got> {
    const res = await fetch(base + path, { redirect: "manual", ...init });
    return { status: res.status, location: res.headers.get("location"), robots: res.headers.get("x-robots-tag"), body: await res.text() };
  }

  try {
    await get("/");
  } catch {
    console.error(`Can't reach ${base}. Start the site first (npm run dev), or pass its address.`);
    process.exit(1);
  }
  console.log(`\nChecking ${base}\n`);

  // --- a throwaway wedding whose locked content is all marker words ---
  const tag = randomUUID().slice(0, 8);
  const mark = (what: string) => `ZQX${tag}${what}`; // unique: can't appear by accident
  const M = {
    venue: mark("venue"),
    address: mark("address"),
    landmarks: mark("landmarks"),
    parking: mark("parking"),
    programme: mark("programme"),
    programmeDetail: mark("programmedetail"),
    dress: mark("dresscode"),
    faqQ: mark("faqquestion"),
    faqA: mark("faqanswer"),
    contact: mark("contactname"),
    storyTitle: mark("storytitle"),
    story: mark("storytext"),
    photo: mark("photoalt"),
    giving: mark("contribution"),
  };
  const LAT = "-1.4242424"; // marker coordinates (the map link would carry these)
  const SURNAME = mark("surname");

  const slug = `access-check-${tag}`;
  const weddingId = (await seedWedding(db, slug)).id;

  try {
    await db
      .update(weddings)
      .set({ storyTitle: M.storyTitle, storyText: M.story, contributionInfo: { "M-Pesa": M.giving } })
      .where(eq(weddings.id, weddingId));
    await db
      .update(venues)
      .set({ name: M.venue, address: M.address, landmarks: M.landmarks, parkingNotes: M.parking, lat: Number(LAT), lng: 36.4242424 })
      .where(eq(venues.weddingId, weddingId));
    const [firstItem] = await db.select({ id: programmeItems.id }).from(programmeItems).where(eq(programmeItems.weddingId, weddingId)).limit(1);
    await db.update(programmeItems).set({ title: M.programme, detail: M.programmeDetail }).where(eq(programmeItems.id, firstItem.id));
    await db.update(dressCode).set({ text: M.dress }).where(eq(dressCode.weddingId, weddingId));
    await db.insert(faqItems).values({ weddingId, question: M.faqQ, answer: M.faqA, sortOrder: 9 });
    await db.insert(contacts).values({ weddingId, role: "Planner", name: M.contact, phone: "0700000000", sortOrder: 9 });
    await db.insert(photos).values({ weddingId, section: "story", src: "/images/story/60b1aba8af93cab6.webp", alt: M.photo });
    const markers = [...Object.values(M), LAT];

    // --- one guest per status ---
    type Guest = { status: InvitationStatus; token: string; firstName: string; passTokens: string[] };
    const guests: Guest[] = [];
    const STATUSES: InvitationStatus[] = ["draft", "sent", "viewed", "awaiting_approval", "declined", "not_approved", "revoked", "approved", "partially_arrived", "arrived"];
    for (const status of STATUSES) {
      const id = randomUUID();
      const firstName = `Guest${status.replace("_", "")}`;
      const fullName = `${firstName} ${SURNAME}`;
      const unlocked = ["approved", "partially_arrived", "arrived"].includes(status);
      const [inv] = await db
        .insert(invitations)
        .values({
          id,
          weddingId,
          fullName,
          status,
          seatAllowance: 1,
          partySize: 2,
          arrivedCount: status === "partially_arrived" ? 1 : status === "arrived" ? 2 : 0,
          respondedAt: ["draft", "sent", "viewed"].includes(status) ? null : new Date(),
          approvedAt: unlocked || status === "revoked" ? new Date() : null,
          // Revoked after being approved: the worst case, a guest who once held a pass (E22).
          statusBeforeRevoke: status === "revoked" ? "approved" : null,
          passVersion: status === "revoked" ? 2 : 1,
          inviteTokenHash: hashToken(inviteTokenFor(id, 1)),
        })
        .returning();
      await db.insert(partyMembers).values([
        { invitationId: id, fullName, isPrimary: true, sortOrder: 0 },
        { invitationId: id, fullName: `Plus ${SURNAME}`, isPrimary: false, sortOrder: 1 },
      ]);
      // Both the current pass and, for the revoked guest, the one it held before.
      const passTokens = [await passTokenFor(inv)];
      if (status === "revoked") passTokens.push(await passTokenFor({ ...inv, passVersion: 1 }));
      guests.push({ status, token: inviteTokenFor(id, 1), firstName, passTokens });
    }
    const approved = guests.find((g) => g.status === "approved")!;

    const leaks = (body: string) => markers.filter((m) => body.includes(m));
    const noLeaks = (body: string, what: string) => {
      const found = leaks(body);
      assert(!found.length, `${what} leaked ${found.length} locked item(s): ${found.join(", ")}`);
    };
    const noPass = (body: string, g: Guest) => {
      assert(!g.passTokens.some((t) => body.includes(t)), "a gate pass token is in the page");
      assert(!body.includes('id="pass"') && !body.includes("/scan/v/"), "the gate pass section is in the page");
    };

    console.log("Personal pages, by status (spec §4a)");

    for (const g of guests.filter((g) => ["approved", "partially_arrived", "arrived"].includes(g.status))) {
      await step(`${g.status}: sees every locked item (proves this check can see a leak)`, async () => {
        const r = await get(`/i/${g.token}`);
        assert(r.status === 200, `HTTP ${r.status}`);
        const missing = markers.filter((m) => !r.body.includes(m));
        assert(!missing.length, `missing ${missing.length}: ${missing.join(", ")}. Does the site use this DATABASE_URL and TOKEN_SECRET?`);
        if (g.status !== "arrived") assert(r.body.includes('id="pass"'), "gate pass section missing");
      });
    }

    for (const g of guests.filter((g) => ["draft", "sent", "viewed", "awaiting_approval", "declined"].includes(g.status))) {
      await step(`${g.status}: their own card and RSVP, nothing locked, no pass (BR-1/2)`, async () => {
        const r = await get(`/i/${g.token}`);
        assert(r.status === 200, `HTTP ${r.status}`);
        assert(r.body.includes(g.firstName), "their card isn't shown");
        noLeaks(r.body, "the page");
        noPass(r.body, g);
      });
    }

    await step("not_approved: a neutral note with the first name only", async () => {
      const g = guests.find((g) => g.status === "not_approved")!;
      const r = await get(`/i/${g.token}`);
      assert(r.body.includes(g.firstName), "first name missing");
      assert(!r.body.includes(SURNAME), "the full name or party is shown");
      noLeaks(r.body, "the page");
      noPass(r.body, g);
    });

    await step("revoked (was approved): nothing at all, not even a name; old pass gone (E22)", async () => {
      const g = guests.find((g) => g.status === "revoked")!;
      const r = await get(`/i/${g.token}`);
      assert(!r.body.includes(g.firstName) && !r.body.includes(SURNAME), "a name is shown");
      noLeaks(r.body, "the page");
      noPass(r.body, g);
    });

    await step("unknown and malformed links look like no link (BR-4)", async () => {
      for (const t of [inviteTokenFor(randomUUID(), 1), "not-a-token", "%27%3Cscript%3E"]) {
        const r = await get(`/i/${t}`);
        noLeaks(r.body, `/i/${t.slice(0, 12)}…`);
        assert(!r.body.includes(SURNAME), "a guest name is shown");
      }
    });

    await step("old /pass and /day links redirect without revealing anything (D22)", async () => {
      const g = guests.find((g) => g.status === "awaiting_approval")!;
      for (const path of [`/i/${g.token}/pass`, `/i/${g.token}/day`]) {
        const r = await get(path);
        assert([307, 308].includes(r.status) && r.location?.includes(`/i/${g.token}#`), `${path.split("/").pop()}: HTTP ${r.status}`);
        noLeaks(r.body, path.split("/").pop()!);
      }
    });

    await step("personal pages tell search engines not to index them", async () => {
      const r = await get(`/i/${approved.token}`);
      assert(r.robots?.includes("noindex"), `X-Robots-Tag is ${r.robots ?? "missing"}`);
    });

    console.log("\nGate pass and scanner routes, without an usher login");

    await step("a pass opened with a normal camera shows no guest details", async () => {
      const r = await get(`/scan/v/${approved.passTokens[0]}`);
      assert(r.status === 200, `HTTP ${r.status}`);
      assert(!r.body.includes(SURNAME) && !r.body.includes(approved.firstName), "a guest name is shown");
      noLeaks(r.body, "the page");
    });

    const json = (body: unknown, cookie?: string) => ({
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const refused = (r: Got, what: string) => {
      assert(r.status === 401 || r.status === 403, `${what}: HTTP ${r.status}, expected 401`);
      assert(!r.body.includes(SURNAME), `${what}: a guest name is in the reply`);
    };
    // A guest's own link must not work as a staff login either.
    const asGuest = (cookieName: string) => `${cookieName}=${approved.token}`;

    await step("scanner routes refuse anyone without an usher login (A6, E26)", async () => {
      for (const cookie of [undefined, asGuest(USHER_COOKIE)]) {
        const who = cookie ? "with a guest's token as the cookie" : "no cookie";
        refused(await get("/api/scan/verify", json({ scanned: approved.passTokens[0] }, cookie)), `verify, ${who}`);
        refused(await get("/api/scan/admit", json({ scanned: approved.passTokens[0], count: 1 }, cookie)), `admit, ${who}`);
        refused(await get("/api/scan/sync", json({ entries: [] }, cookie)), `sync, ${who}`);
        refused(await get("/api/scan/roster", cookie ? { headers: { Cookie: cookie } } : {}), `roster, ${who}`);
        refused(await get(`/api/scan/search?q=${SURNAME}`, cookie ? { headers: { Cookie: cookie } } : {}), `search, ${who}`);
      }
      const [after] = await db.select({ arrived: invitations.arrivedCount }).from(invitations).where(eq(invitations.inviteTokenHash, hashToken(approved.token)));
      assert(after?.arrived === 0, "someone was checked in without a login");
    });

    console.log("\nAdmin, without the admin login");

    await step("CSV exports refuse anyone without an admin login (N4, D13)", async () => {
      for (const kind of ["guests", "dietary", "headcount", "checkins"]) {
        refused(await get(`/api/export/${kind}`), `${kind}, no cookie`);
        refused(await get(`/api/export/${kind}`, { headers: { Cookie: asGuest(ADMIN_COOKIE) } }), `${kind}, guest token as cookie`);
      }
    });

    // The real wedding: its guest names and locked content must not reach a visitor.
    const [real] = await db.select().from(weddings).where(eq(weddings.slug, config.weddingSlug()));
    assert(real, `no wedding with slug "${config.weddingSlug()}"`);
    const realNames = (await db.select({ n: invitations.fullName }).from(invitations).where(eq(invitations.weddingId, real.id))).map((r) => r.n);
    const realLocked = await lockedTextOf(real.id, real.storyText);
    // Whole words only: a guest called "Joy" must not match "Joyly" in a dev-mode file path.
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (body: string, list: string[]) =>
      list.filter((s) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`, "u").test(body)).length;

    await step("admin pages show no guest names or locked content before login", async () => {
      for (const path of ["/admin", "/admin/guests", "/admin/settings", "/admin/tools"]) {
        const r = await get(path);
        const names = count(r.body, realNames);
        const locked = count(r.body, realLocked);
        assert(!names && !locked, `${path}: ${names} guest name(s), ${locked} locked item(s) in the page`);
      }
    });

    console.log("\nThe public page");

    await step("shows the teaser only: none of the real wedding's locked content or guest names", async () => {
      const r = await get("/");
      assert(r.status === 200, `HTTP ${r.status}`);
      const locked = count(r.body, realLocked);
      const names = count(r.body, realNames);
      assert(!locked && !names, `${locked} locked item(s) and ${names} guest name(s) are in the page`);
    });

    await step("the request form is hidden while requests are off (D21)", async () => {
      const r = await get("/");
      if (real.publicRequestsEnabled) return; // the couple turned it on: nothing to check
      assert(!r.body.includes('id="request"'), "the request form is shown");
    });

    async function lockedTextOf(id: string, storyText: string | null): Promise<string[]> {
      const [v, p, f, c, d, ph] = await Promise.all([
        db.select().from(venues).where(eq(venues.weddingId, id)),
        db.select().from(programmeItems).where(eq(programmeItems.weddingId, id)),
        db.select().from(faqItems).where(eq(faqItems.weddingId, id)),
        db.select().from(contacts).where(eq(contacts.weddingId, id)),
        db.select().from(dressCode).where(eq(dressCode.weddingId, id)),
        db.select().from(photos).where(eq(photos.weddingId, id)),
      ]);
      const text = [
        ...v.flatMap((x) => [x.name, x.address, x.landmarks, x.parkingNotes, x.lat?.toFixed(5)]),
        ...p.map((x) => x.detail),
        ...f.map((x) => x.answer),
        ...c.map((x) => x.phone),
        ...d.map((x) => x.text),
        ...ph.map((x) => x.src),
        storyText?.slice(0, 60),
      ];
      // Short or placeholder strings ("To be confirmed") could appear by coincidence.
      return text.filter((s): s is string => !!s && s.length >= 12 && !/to be confirmed/i.test(s));
    }
  } finally {
    await db.delete(weddings).where(eq(weddings.id, weddingId)); // cascades to everything it created
    console.log(failures ? `\n✗ ${failures} check(s) failed.` : "\n✓ All access checks passed. The throwaway wedding was deleted.");
    process.exit(failures ? 1 : 0);
  }
}

void main();
