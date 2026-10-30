// The wedding content. Public since D29 (it was approved-only under BR-1). Every exported function
// here takes a proof from the access gate (PublicAccess, ApprovedAccess or VendorAccess, D25), so a
// purged wedding's content can't be fetched by mistake.

import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { contacts, dressCode, faqItems, photos, programmeItems, venues } from "../db/schema";
import { directionsUrl, openInMapsUrl } from "../utils/maps";
import type { ApprovedAccess, PublicAccess, VendorAccess } from "./access";

/** Venues, programme and contacts: shared by guests (BR-1) and vendors (D25). Not exported: callers prove access first. */
async function loadSchedule(db: Db, weddingId: string) {
  const [venueRows, programme, contactRows] = await Promise.all([
    db.select().from(venues).where(eq(venues.weddingId, weddingId)).orderBy(asc(venues.sortOrder)),
    db.select().from(programmeItems).where(eq(programmeItems.weddingId, weddingId)).orderBy(asc(programmeItems.startsAt), asc(programmeItems.sortOrder)),
    db.select().from(contacts).where(eq(contacts.weddingId, weddingId)).orderBy(asc(contacts.sortOrder)),
  ]);

  const venueName = new Map(venueRows.map((v) => [v.id, v.name]));

  return {
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
    contacts: contactRows.map((c) => ({ role: c.role, name: c.name, phone: c.phone })),
  };
}

export async function getWeddingContent(db: Db, access: PublicAccess | ApprovedAccess) {
  const { wedding } = access;
  const w = wedding.id;

  const [schedule, dress, faq, photoRows] = await Promise.all([
    loadSchedule(db, w),
    db.select().from(dressCode).where(eq(dressCode.weddingId, w)),
    db.select().from(faqItems).where(eq(faqItems.weddingId, w)).orderBy(asc(faqItems.sortOrder)),
    db.select().from(photos).where(eq(photos.weddingId, w)).orderBy(asc(photos.sortOrder)),
  ]);

  return {
    storyTitle: wedding.storyTitle,
    story: wedding.storyText,
    gatesOpenAt: wedding.gatesOpenAt,
    contributionInfo: wedding.contributionInfo,
    venues: schedule.venues,
    programme: schedule.programme,
    dressCode: dress[0] ? { text: dress[0].text, swatches: dress[0].swatches } : null,
    faq: faq.map((f) => ({ question: f.question, answer: f.answer })),
    contacts: schedule.contacts,
    photos: photoRows.map((p) => ({ section: p.section, src: p.src, alt: p.alt })),
  };
}

export type WeddingContent = Awaited<ReturnType<typeof getWeddingContent>>;

/** D25: a vendor's working subset. No story, photos, FAQ, dress code or contribution details. */
export async function getVendorContent(db: Db, access: VendorAccess) {
  const { venues, programme, contacts } = await loadSchedule(db, access.wedding.id);
  return { gatesOpenAt: access.wedding.gatesOpenAt, venues, programme, contacts };
}

export type VendorContent = Awaited<ReturnType<typeof getVendorContent>>;
