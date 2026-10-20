// Data for the guest pages (PROJECT_SPEC §4a): the public teaser, and the personal
// invitation at each access level. Locked content is only fetched for approved guests.

import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { invitations, partyMembers, rsvpEvents, venues, weddings, type Invitation, type Wedding } from "../db/schema";
import { isRsvpOpen } from "../domain/rules";
import { nextStatus } from "../domain/status";
import { AppError } from "../errors";
import { approvedFrom, getAccess } from "./access";
import { logActivity } from "./activity";
import { getApprovedContent, type ApprovedContent } from "./content";

/** Names, date and countdown target only: never venue or programme (§4a). */
function teaserOf(w: Wedding) {
  return {
    brideName: w.brideName,
    groomName: w.groomName,
    monogram: w.monogram,
    weddingDate: w.weddingDate,
    ceremonyStartAt: w.ceremonyStartAt,
    timezone: w.timezone,
    hashtag: w.hashtag,
  };
}

export type Teaser = ReturnType<typeof teaserOf>;

export async function getPublicTeaser(db: Db, slug: string): Promise<Teaser & { acceptsRequests: boolean }> {
  const [w] = await db.select().from(weddings).where(eq(weddings.slug, slug));
  if (!w || w.purgedAt) throw new AppError("NOT_FOUND", "Wedding not found.");
  return { ...teaserOf(w), acceptsRequests: w.publicRequestsEnabled };
}

export type InvitationPage =
  | { level: "public" }
  | { level: "revoked" } // neutral page: no names, nothing else (§4a)
  | { level: "not_approved"; teaser: Teaser; guest: { firstName: string } }
  | {
      level: "invited" | "declined" | "approved";
      teaser: Teaser;
      guest: GuestView;
      rsvp: RsvpView;
      /** Only present for approved guests (BR-1). */
      content?: ApprovedContent;
    };

type GuestView = {
  firstName: string;
  fullName: string;
  seatAllowance: number;
  partySize: number;
  awaitingApproval: boolean;
  arrivedCount: number;
  /** Whether the couple already has these. The values themselves are never sent (E2: forwarded links). */
  hasEmail: boolean;
  hasPhone: boolean;
};

type RsvpView = {
  attending: boolean | null;
  members: { fullName: string; isChild: boolean; dietary: string; dietaryNotes: string | null; isPrimary: boolean }[];
  events: { event: string; attending: boolean }[];
  message: string | null;
  deadline: Date;
  open: boolean;
  /** The events this wedding has (D9): the RSVP form offers these. */
  weddingEvents: ("ceremony" | "reception" | "traditional")[];
};

export async function getInvitationPage(
  db: Db,
  token: string | null | undefined,
  opts: { now?: Date } = {},
): Promise<InvitationPage> {
  const access = await getAccess(db, token);
  if (access.level === "public") return { level: "public" };
  if (access.level === "revoked") return { level: "revoked" };

  const { invitation: inv, wedding } = access;
  const teaser = teaserOf(wedding);
  if (access.level === "not_approved") return { level: "not_approved", teaser, guest: { firstName: firstName(inv) } };

  const [members, events, venueKinds] = await Promise.all([
    db.select().from(partyMembers).where(eq(partyMembers.invitationId, inv.id)).orderBy(asc(partyMembers.sortOrder)),
    db.select().from(rsvpEvents).where(eq(rsvpEvents.invitationId, inv.id)),
    db.select({ kind: venues.kind }).from(venues).where(eq(venues.weddingId, wedding.id)).orderBy(asc(venues.sortOrder)),
  ]);

  const page = {
    level: access.level,
    teaser,
    guest: {
      firstName: firstName(inv),
      fullName: inv.fullName,
      seatAllowance: inv.seatAllowance,
      partySize: inv.partySize,
      awaitingApproval: inv.status === "awaiting_approval",
      arrivedCount: inv.arrivedCount,
      hasEmail: !!inv.email,
      hasPhone: !!inv.phone,
    },
    rsvp: {
      attending: inv.respondedAt ? inv.status !== "declined" : null,
      members: members.map((m) => ({
        fullName: m.fullName,
        isChild: m.isChild,
        dietary: m.dietary,
        dietaryNotes: m.dietaryNotes,
        isPrimary: m.isPrimary,
      })),
      events: events.map((e) => ({ event: e.event, attending: e.attending })),
      message: inv.responseMessage,
      deadline: wedding.rsvpDeadline,
      open: isRsvpOpen(wedding.rsvpDeadline, opts.now),
      weddingEvents: [...new Set(venueKinds.map((v) => v.kind))],
    },
  };

  const approved = approvedFrom(access);
  return approved ? { ...page, content: await getApprovedContent(db, approved) } : page;
}

/**
 * Records that the guest opened their personal link: the proof of receipt (U3).
 * E27: opens by a signed-in admin are not counted.
 */
export async function recordView(
  db: Db,
  token: string | null | undefined,
  opts: { viewer: "guest" | "admin"; now?: Date },
): Promise<void> {
  if (opts.viewer === "admin") return;
  const access = await getAccess(db, token);
  if (access.level === "public") return;
  const now = opts.now ?? new Date();

  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, access.invitation.id)).for("update");
    const to = nextStatus(inv.status, { type: "view" });
    await tx
      .update(invitations)
      .set({
        status: to,
        firstViewedAt: inv.firstViewedAt ?? now,
        lastViewedAt: now,
        viewCount: sql`${invitations.viewCount} + 1`,
      })
      .where(eq(invitations.id, inv.id));

    // Log the first view only: later opens just update the count.
    if (!inv.firstViewedAt) {
      await logActivity(tx, { weddingId: inv.weddingId, actor: "guest", invitationId: inv.id, action: "viewed", meta: { from: inv.status, to } });
    }
  });
}

const firstName = (inv: Invitation) => inv.fullName.trim().split(/\s+/)[0];
