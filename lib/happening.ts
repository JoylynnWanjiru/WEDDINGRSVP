// "Happening now / next" (N2). Pure function shared by the server (day-of service, tests)
// and the browser (the live banner), so it has no server-only imports.

export type ProgrammeItem = { startsAt: Date; title: string; detail: string | null; venue: string | null };

const LAST_ITEM_GRACE_MS = 2 * 60 * 60 * 1000;

/** The item that started most recently (until 2 h after the last one), and the next one. */
export function happeningNow<T extends { startsAt: Date }>(programme: T[], now: Date): { now: T | null; next: T | null } {
  const sorted = [...programme].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const started = sorted.filter((i) => i.startsAt <= now);
  const next = sorted.find((i) => i.startsAt > now) ?? null;
  let current = started.at(-1) ?? null;
  if (current && !next && now.getTime() - current.startsAt.getTime() > LAST_ITEM_GRACE_MS) current = null;
  return { now: current, next };
}
