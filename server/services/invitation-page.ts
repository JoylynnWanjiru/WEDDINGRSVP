// Data for the guest pages (PROJECT_SPEC §4a): the public page, and the personal invitation at
// each access level. D29: the wedding content is public; only the gate pass stays approved-only.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { invitationOpens, invitations, partyMembers, rsvpEvents, venues, weddings, type Invitation, type Wedding } from "../db/schema";
import { isRsvpOpen } from "../domain/rules";
import { isUnlocked, nextStatus } from "../domain/status";
import { AppError } from "../errors";
import { getAccess, getPublicAccess, publicFrom } from "./access";
import { logActivity } from "./activity";
import { getWeddingContent, type WeddingContent } from "./content";

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
      /** D29: the wedding content, for every guest who can still respond or is approved. */
      content: WeddingContent;
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

  const proof = publicFrom(access)!; // invited, declined or approved here
  return { ...page, content: await getWeddingContent(db, proof) };
}

/**
 * D29: the public page. Everything except the gate pass: the content, plus what the public
 * RSVP form needs (deadline, events, how many extra guests a self-RSVP may bring).
 */
export async function getPublicPage(db: Db, slug: string, opts: { now?: Date } = {}) {
  const access = await getPublicAccess(db, slug);
  const { wedding } = access;
  const [content, venueKinds] = await Promise.all([
    getWeddingContent(db, access),
    db.select({ kind: venues.kind }).from(venues).where(eq(venues.weddingId, wedding.id)).orderBy(asc(venues.sortOrder)),
  ]);
  return {
    teaser: teaserOf(wedding),
    content,
    rsvp: {
      deadline: wedding.rsvpDeadline,
      open: isRsvpOpen(wedding.rsvpDeadline, opts.now),
      weddingEvents: [...new Set(venueKinds.map((v) => v.kind))],
      seatAllowance: wedding.defaultSeatAllowance,
    },
  };
}

export type PublicPage = Awaited<ReturnType<typeof getPublicPage>>;

/** D28: taps from the same device closer together than this are one visit in the open log. */
export const OPEN_VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * Records that the guest opened their personal link: the proof of receipt (U3).
 * E27: opens by a signed-in admin are not counted.
 * D28: every open also goes into the open log, grouped into visits per device.
 */
export async function recordView(
  db: Db,
  token: string | null | undefined,
  opts: { viewer: "guest" | "admin"; device?: string; now?: Date },
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
        // D22: the pass is a section of this page, so an approved guest opening it has seen their pass.
        ...(isUnlocked(inv.status) && !inv.passFirstViewedAt ? { passFirstViewedAt: now } : {}),
        firstViewedAt: inv.firstViewedAt ?? now,
        lastViewedAt: now,
        viewCount: sql`${invitations.viewCount} + 1`,
      })
      .where(eq(invitations.id, inv.id));

    // Log the first view only: later opens just update the count.
    if (!inv.firstViewedAt) {
      await logActivity(tx, { weddingId: inv.weddingId, actor: "guest", invitationId: inv.id, action: "viewed", meta: { from: inv.status, to } });
    }

    // D28: the open log. Same device within the visit gap extends the last visit.
    const device = opts.device ?? "Unknown device";
    const [last] = await tx
      .select()
      .from(invitationOpens)
      .where(and(eq(invitationOpens.invitationId, inv.id), eq(invitationOpens.device, device)))
      .orderBy(desc(invitationOpens.lastSeenAt))
      .limit(1);
    if (last && now.getTime() - last.lastSeenAt.getTime() < OPEN_VISIT_GAP_MS) {
      await tx
        .update(invitationOpens)
        .set({ lastSeenAt: now, taps: sql`${invitationOpens.taps} + 1` })
        .where(eq(invitationOpens.id, last.id));
    } else {
      await tx.insert(invitationOpens).values({ weddingId: inv.weddingId, invitationId: inv.id, device, openedAt: now, lastSeenAt: now });
    }
  });
}

const firstName = (inv: Invitation) => inv.fullName.trim().split(/\s+/)[0];
