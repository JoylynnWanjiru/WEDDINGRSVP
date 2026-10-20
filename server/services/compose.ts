// Builds one queued email from the database as it is at send time. Every
// template re-checks that it still applies; if not, the email is cancelled
// (e.g. an approval email for a guest revoked a minute ago, BR-18).

import { asc, eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { inviteLink } from "../auth/tokens";
import { config } from "../config";
import type { Db } from "../db/client";
import { emailQueue, partyMembers, type Invitation, type Wedding } from "../db/schema";
import { isUnlocked } from "../domain/status";
import { isRsvpOpen } from "../domain/rules";
import {
  approvalPassEmail,
  dayBeforeEmail,
  detailsUpdatedEmail,
  invitationEmail,
  reminderNoResponseEmail,
  revokedEmail,
  rsvpReceivedEmail,
  type CoupleInfo,
  type Rendered,
} from "../emails/templates";
import type { OutgoingEmail } from "../integrations/mailer";
import { qrPng } from "../integrations/qr";
import { approvedFrom } from "./access";
import { getApprovedContent } from "./content";
import { passTokenFor, scanUrl } from "./gate";

type QueueRow = typeof emailQueue.$inferSelect;

export type Composed = { send: Rendered & { to: string; fromName: string; attachments?: OutgoingEmail["attachments"] } } | { cancel: string };

// --- open-tracking pixel token: queue id + keyed signature, so ids can't be guessed (E12) ---

const pixelSig = (queueId: string) => createHmac("sha256", config.tokenSecret()).update(`pixel:${queueId}`).digest("base64url").slice(0, 22);

export const pixelTokenFor = (queueId: string) => `${queueId}.${pixelSig(queueId)}`;

export function parsePixelToken(token: string): string | null {
  const [queueId, sig] = token.split(".");
  if (!queueId || !sig || !/^[0-9a-f-]{36}$/.test(queueId)) return null;
  return pixelSig(queueId) === sig ? queueId : null;
}

// --- compose ---

export async function composeEmail(db: Db, row: QueueRow, inv: Invitation, wedding: Wedding, now: Date): Promise<Composed> {
  if (!inv.email) return { cancel: "No email address." };
  if (inv.emailBouncedAt) return { cancel: "Email address marked as bounced (E11)." };

  const c: CoupleInfo = { brideName: wedding.brideName, groomName: wedding.groomName, weddingDate: wedding.weddingDate, monogram: wedding.monogram };
  const firstName = inv.fullName.trim().split(/\s+/)[0];
  const link = inviteLink(inv.id, inv.inviteTokenVersion);
  const base = { to: inv.email, fromName: `${wedding.brideName} & ${wedding.groomName}` };
  const approved = approvedFrom({ level: isUnlocked(inv.status) ? "approved" : "invited", invitation: inv, wedding });

  switch (row.template) {
    case "invitation":
      if (inv.status === "revoked") return { cancel: "Invitation revoked." };
      return {
        send: {
          ...base,
          ...invitationEmail({ couple: c, firstName, link, rsvpDeadline: wedding.rsvpDeadline, pixelUrl: `${config.appUrl()}/api/track/open/${pixelTokenFor(row.id)}` }),
        },
      };

    case "rsvp_received": {
      if (inv.status === "revoked") return { cancel: "Invitation revoked." };
      const party = await db.select({ fullName: partyMembers.fullName }).from(partyMembers).where(eq(partyMembers.invitationId, inv.id)).orderBy(asc(partyMembers.sortOrder));
      return {
        send: {
          ...base,
          ...rsvpReceivedEmail({
            couple: c,
            firstName,
            attending: inv.status !== "declined",
            party: party.map((m) => m.fullName),
            awaitingApproval: inv.status === "awaiting_approval",
            link,
          }),
        },
      };
    }

    case "approval_pass":
    case "reminder_day_before":
    case "details_updated": {
      if (!approved) return { cancel: "Guest is no longer approved (BR-18)." };
      // Queued for an older pass version (the party changed and was re-approved): a newer email replaces it.
      if (row.template === "approval_pass" && row.dedupeKey && !row.dedupeKey.endsWith(`:${inv.passVersion}`)) {
        return { cancel: "Superseded by a later approval." };
      }
      const content = await getApprovedContent(db, approved);
      // D22: one page per guest; the email buttons jump to its sections.
      const passLink = `${link}#pass`;
      if (row.template === "details_updated") return { send: { ...base, ...detailsUpdatedEmail({ couple: c, firstName, pageLink: link }) } };

      // The QR for the current pass version, as an inline attachment (D14).
      const qr = { filename: "gate-pass.png", cid: "gate-pass-qr", contentType: "image/png", content: await qrPng(scanUrl(await passTokenFor(inv))) };
      const withQr = { ...base, attachments: [qr] };
      if (row.template === "reminder_day_before") {
        return {
          send: { ...withQr, ...dayBeforeEmail({ couple: c, firstName, passLink, pageLink: `${link}#programme`, gatesOpenAt: wedding.gatesOpenAt, content, qrCid: qr.cid }) },
        };
      }
      return {
        send: {
          ...withQr,
          ...approvalPassEmail({ couple: c, firstName, partySize: inv.partySize, passLink, pageLink: link, gatesOpenAt: wedding.gatesOpenAt, content, qrCid: qr.cid }),
        },
      };
    }

    case "reminder_no_response":
      if (inv.respondedAt) return { cancel: "Guest has responded." };
      if (inv.status === "revoked") return { cancel: "Invitation revoked." };
      if (!isRsvpOpen(wedding.rsvpDeadline, now)) return { cancel: "RSVP deadline has passed." };
      return { send: { ...base, ...reminderNoResponseEmail({ couple: c, firstName, link, rsvpDeadline: wedding.rsvpDeadline }) } };

    case "revoked":
      if (inv.status !== "revoked") return { cancel: "Invitation was restored." };
      return { send: { ...base, ...revokedEmail({ couple: c, firstName }) } };
  }
}
