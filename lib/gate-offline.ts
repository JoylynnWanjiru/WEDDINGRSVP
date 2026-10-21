// Offline gate checks (N3, E17). Pure functions shared by the scanner page and the
// server, so there are no server-only imports. The browser can't verify the pass
// signature (the secret stays on the server); offline it trusts the approved list
// cached at the last sync, and every offline check-in is re-checked on upload.
// Guests and vendor teams (D25) are checked the same way; `kind` tells them apart.

/** Accepts the full scanned URL or the bare token. */
export function tokenFromScan(scanned: string): string {
  const s = scanned.trim();
  const i = s.indexOf("/scan/v/");
  return (i >= 0 ? s.slice(i + "/scan/v/".length) : s).split(/[?#]/)[0];
}

export type Kind = "guest" | "vendor";

export type PassClaims = { kind: Kind; id: string; weddingId: string; passVersion: number };

const AUDIENCES: Record<string, Kind> = { "gate-pass": "guest", "vendor-pass": "vendor" };

/** Reads the pass's claims WITHOUT checking the signature: offline use only. */
export function readPassClaims(scanned: string): PassClaims | null {
  const parts = tokenFromScan(scanned).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as Record<string, unknown>;
    const kind = typeof json.aud === "string" ? AUDIENCES[json.aud] : undefined;
    if (!kind || typeof json.sub !== "string" || typeof json.w !== "string" || typeof json.pv !== "number") return null;
    return { kind, id: json.sub, weddingId: json.w, passVersion: json.pv };
  } catch {
    return null;
  }
}

/** /api/scan/roster as sent by the server. */
export type ServerRoster = {
  syncedAt: string;
  guests: { invitationId: string; passVersion: number; name: string; partySize: number; arrivedCount: number }[];
  vendors?: { vendorId: string; passVersion: number; name: string; role: string; partySize: number; arrivedCount: number }[];
};

/** One approved party or active vendor team, as cached for offline use. */
export type RosterEntry = { kind: Kind; id: string; passVersion: number; name: string; role?: string; partySize: number; arrivedCount: number };

export function rosterEntries(r: ServerRoster): RosterEntry[] {
  return [
    ...r.guests.map(({ invitationId, ...g }) => ({ kind: "guest" as const, id: invitationId, ...g })),
    ...(r.vendors ?? []).map(({ vendorId, ...v }) => ({ kind: "vendor" as const, id: vendorId, ...v })),
  ];
}

/** A check-in recorded offline, waiting for /api/scan/sync. */
export type PendingCheckIn = { clientRef: string; kind: Kind; id: string; passVersion?: number; count: number; at: string; name: string };

/** The body the server expects for one offline check-in. */
export const syncEntry = ({ clientRef, kind, id, passVersion, count, at }: PendingCheckIn) => ({
  clientRef,
  ...(kind === "vendor" ? { vendorId: id } : { invitationId: id }),
  passVersion,
  count,
  at,
});

/** People this phone has admitted offline for one party, not yet uploaded. */
export const queuedFor = (pending: PendingCheckIn[], kind: Kind, id: string) =>
  pending.filter((p) => p.kind === kind && p.id === id).reduce((n, p) => n + p.count, 0);

export type OfflineCheck =
  | { result: "ok"; entry: RosterEntry; arrivedCount: number; remaining: number }
  | { result: "already_admitted"; entry: RosterEntry; arrivedCount: number }
  | { result: "outdated"; entry: RosterEntry }
  | { result: "unknown" };

/**
 * BR-13 against the cached list. Arrivals already recorded on this phone but not yet
 * uploaded count too, so one device can't admit a party twice while offline.
 * Another device's offline admits can't be seen until both sync (flagged then).
 */
export function checkOffline(roster: RosterEntry[], pending: PendingCheckIn[], target: { claims: PassClaims } | { kind: Kind; id: string }): OfflineCheck {
  const { kind, id } = "claims" in target ? target.claims : target;
  const entry = roster.find((e) => e.kind === kind && e.id === id);
  if (!entry) return { result: "unknown" }; // not approved at the last sync, or not a real pass
  if ("claims" in target && target.claims.passVersion !== entry.passVersion) return { result: "outdated", entry }; // E6, E22
  const arrivedCount = entry.arrivedCount + queuedFor(pending, kind, id);
  const remaining = entry.partySize - arrivedCount;
  if (remaining <= 0) return { result: "already_admitted", entry, arrivedCount };
  return { result: "ok", entry, arrivedCount, remaining };
}

/** Offline name search (E18): the party's own name, or a vendor's company or role. */
export function searchRoster(roster: RosterEntry[], query: string): RosterEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return roster
    .filter((e) => e.name.toLowerCase().includes(q) || !!e.role?.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
}

export type SyncOutcome = { clientRef: string; outcome: "applied" | "applied_partially" | "duplicate" | "rejected"; reason?: string };

/** After an upload: every entry the server answered is done; the rest wait for the next try. */
export function afterSync(pending: PendingCheckIn[], results: SyncOutcome[]): { pending: PendingCheckIn[]; flagged: SyncOutcome[] } {
  const answered = new Set(results.map((r) => r.clientRef));
  return {
    pending: pending.filter((p) => !answered.has(p.clientRef)),
    flagged: results.filter((r) => r.outcome === "rejected" || r.outcome === "applied_partially"),
  };
}
