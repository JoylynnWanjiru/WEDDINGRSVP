// What a shared link shows in WhatsApp, Facebook, etc. (the "link preview"): the
// couple's names, the date and a short invitation line. Names and date only, never
// the venue or programme (§4a), and never a guest's name: a forwarded link must not
// tell strangers who it was meant for.

import type { Db } from "../db/client";
import { isAppError } from "../errors";
import { formatDate } from "../utils/dates";
import { getPublicTeaser } from "./invitation-page";

export type ShareCard = { title: string; description: string; couple: string; date: string };

export function shareCardFor(teaser: { brideName: string; groomName: string; weddingDate: string }): ShareCard {
  const couple = `${teaser.brideName} & ${teaser.groomName}`;
  const date = formatDate(teaser.weddingDate);
  return {
    title: `${couple} · You're invited`,
    description: `Join us as we celebrate our wedding on ${date}. Open your personal invitation to RSVP.`,
    couple,
    date,
  };
}

/** Null when the wedding doesn't exist or its data was deleted: callers fall back to a generic card. */
export async function getShareCard(db: Db, slug: string): Promise<ShareCard | null> {
  try {
    return shareCardFor(await getPublicTeaser(db, slug));
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  }
}
