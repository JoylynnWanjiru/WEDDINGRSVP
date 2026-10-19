// Day-of page (N2, PROJECT_SPEC §5): the full programme with "happening now / next",
// directions and contacts. Approved guests only (BR-1).

import type { Db } from "../db/client";
import { requireApproved } from "./access";
import { getApprovedContent, type ApprovedContent } from "./content";

type Item = ApprovedContent["programme"][number];

const LAST_ITEM_GRACE_MS = 2 * 60 * 60 * 1000;

/** The item that started most recently (until 2 h after the last one), and the next one. */
export function happeningNow(programme: Item[], now: Date): { now: Item | null; next: Item | null } {
  const sorted = [...programme].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const started = sorted.filter((i) => i.startsAt <= now);
  const next = sorted.find((i) => i.startsAt > now) ?? null;
  let current = started.at(-1) ?? null;
  if (current && !next && now.getTime() - current.startsAt.getTime() > LAST_ITEM_GRACE_MS) current = null;
  return { now: current, next };
}

export async function getDayOfPage(db: Db, token: string | null | undefined, opts: { now?: Date } = {}) {
  const access = await requireApproved(db, token);
  const content = await getApprovedContent(db, access);
  const now = opts.now ?? new Date();
  return {
    guestName: access.invitation.fullName,
    partySize: access.invitation.partySize,
    arrivedCount: access.invitation.arrivedCount,
    gatesOpenAt: content.gatesOpenAt,
    happening: happeningNow(content.programme, now),
    programme: content.programme,
    venues: content.venues,
    contacts: content.contacts,
  };
}
