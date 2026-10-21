// Offline scanner rules (N3, E17, E18, BR-13, BR-16, E6/E22) and the shared QR parsing,
// for guests and vendor teams (D25).

import { describe, expect, it } from "vitest";
import { signPassToken, signVendorPassToken } from "@/server/auth/tokens";
import {
  afterSync,
  checkOffline,
  readPassClaims,
  rosterEntries,
  searchRoster,
  syncEntry,
  tokenFromScan,
  type PendingCheckIn,
  type RosterEntry,
} from "@/lib/gate-offline";

const INV = "6f1c1c2e-3b7a-4a5e-9d2f-0c1b2a3d4e5f";
const VEN = "7a2d2d3f-4c8b-4b6f-8e3a-1d2c3b4e5f60";
const WED = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const guest = (over: Partial<RosterEntry> = {}): RosterEntry => ({ kind: "guest", id: INV, passVersion: 2, name: "Wanjiru Kamau", partySize: 3, arrivedCount: 0, ...over });
const vendor = (over: Partial<RosterEntry> = {}): RosterEntry => ({ kind: "vendor", id: VEN, passVersion: 1, name: "Lens Studio", role: "Photographer", partySize: 2, arrivedCount: 0, ...over });
const pending = (count: number, over: Partial<PendingCheckIn> = {}): PendingCheckIn => ({
  clientRef: `ref-${Math.random().toString(36).slice(2, 10)}`,
  kind: "guest",
  id: INV,
  count,
  at: "2026-12-19T09:00:00.000Z",
  name: "Wanjiru Kamau",
  ...over,
});

describe("reading a scanned pass", () => {
  it("takes the token from the QR URL or a bare token", () => {
    expect(tokenFromScan(" https://site.test/scan/v/abc.def.ghi?x=1 ")).toBe("abc.def.ghi");
    expect(tokenFromScan("abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("reads the claims of a real signed guest or vendor pass without the secret", async () => {
    const token = await signPassToken({ invitationId: INV, weddingId: WED, passVersion: 2 });
    expect(readPassClaims(`https://site.test/scan/v/${token}`)).toEqual({ kind: "guest", id: INV, weddingId: WED, passVersion: 2 });
    const vToken = await signVendorPassToken({ vendorId: VEN, weddingId: WED, passVersion: 1 });
    expect(readPassClaims(vToken)).toEqual({ kind: "vendor", id: VEN, weddingId: WED, passVersion: 1 });
  });

  it("rejects anything that isn't a gate pass", () => {
    const fake = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
    expect(readPassClaims("hello")).toBeNull();
    expect(readPassClaims("a.!!!.c")).toBeNull();
    expect(readPassClaims(fake({ aud: "invite", sub: INV, w: WED, pv: 1 }))).toBeNull();
    expect(readPassClaims(fake({ aud: "gate-pass", sub: INV, w: WED }))).toBeNull();
  });
});

describe("N3 / E17: checking against the cached list", () => {
  const claims = { kind: "guest" as const, id: INV, weddingId: WED, passVersion: 2 };

  it("the server roster becomes one list of guests and vendor teams", () => {
    const entries = rosterEntries({
      syncedAt: "2026-12-19T06:00:00.000Z",
      guests: [{ invitationId: INV, passVersion: 2, name: "Wanjiru Kamau", partySize: 3, arrivedCount: 0 }],
      vendors: [{ vendorId: VEN, passVersion: 1, name: "Lens Studio", role: "Photographer", partySize: 2, arrivedCount: 0 }],
    });
    expect(entries).toEqual([guest(), vendor()]);
  });

  it("an approved party with places left is ok, with what remains", () => {
    expect(checkOffline([guest({ arrivedCount: 1 })], [], { claims })).toMatchObject({ result: "ok", arrivedCount: 1, remaining: 2 });
  });

  it("someone not on the list is unknown (not approved at the last sync)", () => {
    expect(checkOffline([], [], { claims })).toEqual({ result: "unknown" });
  });

  it("D25: a vendor pass matches only the vendor entry, never a guest with the same id", () => {
    const vendorClaims = { kind: "vendor" as const, id: INV, weddingId: WED, passVersion: 2 };
    expect(checkOffline([guest()], [], { claims: vendorClaims })).toEqual({ result: "unknown" });
    expect(checkOffline([vendor()], [], { claims: { ...vendorClaims, id: VEN, passVersion: 1 } })).toMatchObject({ result: "ok", remaining: 2 });
  });

  it("E6/E22: an old pass version is refused", () => {
    expect(checkOffline([guest({ passVersion: 3 })], [], { claims })).toMatchObject({ result: "outdated", entry: { name: "Wanjiru Kamau" } });
  });

  it("BR-16: check-ins made on this phone but not yet uploaded count, so a party can't be admitted twice", () => {
    const queued = [pending(2), pending(1, { id: "someone-else" }), pending(1, { kind: "vendor" })];
    expect(checkOffline([guest()], queued, { claims })).toMatchObject({ result: "ok", arrivedCount: 2, remaining: 1 });
    expect(checkOffline([guest()], [...queued, pending(1)], { claims })).toMatchObject({ result: "already_admitted", arrivedCount: 3 });
  });

  it("E18: a manual admit by name skips the pass version check", () => {
    expect(checkOffline([guest({ passVersion: 9 })], [], { kind: "guest", id: INV })).toMatchObject({ result: "ok", remaining: 3 });
  });

  it("E18: offline name search matches part of the name or a vendor's role, case-insensitive", () => {
    const roster = [guest(), guest({ id: "b", name: "Otieno Ouma" }), vendor()];
    expect(searchRoster(roster, "kam").map((g) => g.name)).toEqual(["Wanjiru Kamau"]);
    expect(searchRoster(roster, "photo").map((g) => g.name)).toEqual(["Lens Studio"]);
    expect(searchRoster(roster, "o")).toEqual([]); // too short
  });
});

describe("uploading offline check-ins", () => {
  it("sends a guest's invitationId or a vendor's vendorId", () => {
    const g = pending(1);
    const v = pending(2, { kind: "vendor", id: VEN, passVersion: 1 });
    expect(syncEntry(g)).toEqual({ clientRef: g.clientRef, invitationId: INV, passVersion: undefined, count: 1, at: g.at });
    expect(syncEntry(v)).toEqual({ clientRef: v.clientRef, vendorId: VEN, passVersion: 1, count: 2, at: v.at });
  });

  it("drops every entry the server answered and flags the ones it couldn't fully apply", () => {
    const [a, b, c] = [pending(1), pending(1), pending(1)];
    const res = afterSync([a, b, c], [
      { clientRef: a.clientRef, outcome: "applied" },
      { clientRef: b.clientRef, outcome: "rejected", reason: "revoked" },
    ]);
    expect(res.pending).toEqual([c]); // not answered: tried again next time
    expect(res.flagged).toEqual([{ clientRef: b.clientRef, outcome: "rejected", reason: "revoked" }]);
  });
});
