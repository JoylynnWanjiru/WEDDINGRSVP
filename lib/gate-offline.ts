// Offline gate checks (N3, E17). Pure functions shared by the scanner page and the
// server, so there are no server-only imports. The browser can't verify the pass
// signature (the secret stays on the server); offline it trusts the approved list
// cached at the last sync, and every offline check-in is re-checked on upload.

/** Accepts the full scanned URL or the bare token. */
export function tokenFromScan(scanned: string): string {
  const s = scanned.trim();
  const i = s.indexOf("/scan/v/");
  return (i >= 0 ? s.slice(i + "/scan/v/".length) : s).split(/[?#]/)[0];
}

export type PassClaims = { invitationId: string; weddingId: string; passVersion: number };

/** Reads the pass's claims WITHOUT checking the signature: offline use only. */
export function readPassClaims(scanned: string): PassClaims | null {
  const parts = tokenFromScan(scanned).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as Record<string, unknown>;
    if (json.aud !== "gate-pass" || typeof json.sub !== "string" || typeof json.w !== "string" || typeof json.pv !== "number") return null;
    return { invitationId: json.sub, weddingId: json.w, passVersion: json.pv };
  } catch {
    return null;
  }
}

/** One approved party as cached from /api/scan/roster. */
export type RosterGuest = { invitationId: string; passVersion: number; name: string; partySize: number; arrivedCount: number };

/** A check-in recorded offline, waiting for /api/scan/sync. */
export type PendingCheckIn = { clientRef: string; invitationId: string; passVersion?: number; count: number; at: string; name: string };

/** People this phone has admitted offline for one party, not yet uploaded. */
export const queuedFor = (pending: PendingCheckIn[], invitationId: string) =>
  pending.filter((p) => p.invitationId === invitationId).reduce((n, p) => n + p.count, 0);

export type OfflineCheck =
  | { result: "ok"; guest: RosterGuest; arrivedCount: number; remaining: number }
  | { result: "already_admitted"; guest: RosterGuest; arrivedCount: number }
  | { result: "outdated"; name: string }
  | { result: "unknown" };

/**
 * BR-13 against the cached list. Arrivals already recorded on this phone but not yet
 * uploaded count too, so one device can't admit a party twice while offline.
 * Another device's offline admits can't be seen until both sync (flagged then).
 */
export function checkOffline(
  roster: RosterGuest[],
  pending: PendingCheckIn[],
  target: { claims: PassClaims } | { invitationId: string },
): OfflineCheck {
  const id = "claims" in target ? target.claims.invitationId : target.invitationId;
  const guest = roster.find((g) => g.invitationId === id);
  if (!guest) return { result: "unknown" }; // not approved at the last sync, or not a real pass
  if ("claims" in target && target.claims.passVersion !== guest.passVersion) return { result: "outdated", name: guest.name }; // E6, E22
  const arrivedCount = guest.arrivedCount + queuedFor(pending, id);
  const remaining = guest.partySize - arrivedCount;
  if (remaining <= 0) return { result: "already_admitted", guest, arrivedCount };
  return { result: "ok", guest, arrivedCount, remaining };
}

/** Offline name search (E18): the party's own name only, as the roster carries no members. */
export function searchRoster(roster: RosterGuest[], query: string): RosterGuest[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return roster.filter((g) => g.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
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
