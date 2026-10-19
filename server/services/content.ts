// Approved-only wedding content (BR-1). Every function here takes ApprovedAccess,
// which only the approval gate can create, so locked data can't be fetched first.

import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { contacts, dressCode, faqItems, photos, programmeItems, venues } from "../db/schema";
import { directionsUrl, openInMapsUrl } from "../utils/maps";
import type { ApprovedAccess } from "./access";

export async function getApprovedContent(db: Db, access: ApprovedAccess) {
  const { wedding } = access;
  const w = wedding.id;

  const [venueRows, programme, dress, faq, contactRows, photoRows] = await Promise.all([
    db.select().from(venues).where(eq(venues.weddingId, w)).orderBy(asc(venues.sortOrder)),
    db.select().from(programmeItems).where(eq(programmeItems.weddingId, w)).orderBy(asc(programmeItems.startsAt), asc(programmeItems.sortOrder)),
    db.select().from(dressCode).where(eq(dressCode.weddingId, w)),
    db.select().from(faqItems).where(eq(faqItems.weddingId, w)).orderBy(asc(faqItems.sortOrder)),
    db.select().from(contacts).where(eq(contacts.weddingId, w)).orderBy(asc(contacts.sortOrder)),
    db.select().from(photos).where(eq(photos.weddingId, w)).orderBy(asc(photos.sortOrder)),
  ]);

  const venueName = new Map(venueRows.map((v) => [v.id, v.name]));

  return {
    story: wedding.storyText,
    gatesOpenAt: wedding.gatesOpenAt,
    contributionInfo: wedding.contributionInfo,
    venues: venueRows.map((v) => ({
      kind: v.kind,
      name: v.name,
      address: v.address,
      landmarks: v.landmarks,
      parkingNotes: v.parkingNotes,
      mapImageUrl: v.mapImageUrl,
      // §6: directions only when coordinates are set
      directionsUrl: v.lat != null && v.lng != null ? directionsUrl(v.lat, v.lng) : null,
      openInMapsUrl: v.lat != null && v.lng != null ? openInMapsUrl(v.lat, v.lng) : null,
    })),
    programme: programme.map((p) => ({
      startsAt: p.startsAt,
      title: p.title,
      detail: p.detail,
      venue: p.venueId ? (venueName.get(p.venueId) ?? null) : null,
    })),
    dressCode: dress[0] ? { text: dress[0].text, swatches: dress[0].swatches } : null,
    faq: faq.map((f) => ({ question: f.question, answer: f.answer })),
    contacts: contactRows.map((c) => ({ role: c.role, name: c.name, phone: c.phone })),
    photos: photoRows.map((p) => ({ section: p.section, src: p.src, alt: p.alt })),
  };
}

export type ApprovedContent = Awaited<ReturnType<typeof getApprovedContent>>;
