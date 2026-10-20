// Day-of page (N2, PROJECT_SPEC §5): the full programme with "happening now / next",
// directions and contacts. Approved guests only (BR-1).

import { happeningNow } from "../../lib/happening";
import type { Db } from "../db/client";
import { requireApproved } from "./access";
import { getApprovedContent } from "./content";

export { happeningNow };

export async function getDayOfPage(db: Db, token: string | null | undefined, opts: { now?: Date } = {}) {
  const access = await requireApproved(db, token);
  const content = await getApprovedContent(db, access);
  const now = opts.now ?? new Date();
  return {
    guestName: access.invitation.fullName,
    partySize: access.invitation.partySize,
    arrivedCount: access.invitation.arrivedCount,
    brideName: access.wedding.brideName,
    groomName: access.wedding.groomName,
    weddingDate: access.wedding.weddingDate,
    gatesOpenAt: content.gatesOpenAt,
    happening: happeningNow(content.programme, now),
    programme: content.programme,
    venues: content.venues,
    contacts: content.contacts,
  };
}
