// Usage: npm run test-guests          create test guests and print their links
//        npm run test-guests -- --remove   delete them again
// Test guests are fake (no real phone/email) and marked in `notes`, so --remove
// deletes only them, never a real guest.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashToken, inviteLink, inviteTokenFor } from "../server/auth/tokens";
import { config } from "../server/config";
import { getDb } from "../server/db/client";
import { invitations, partyMembers, weddings } from "../server/db/schema";
import type { InvitationStatus } from "../server/domain/status";

const MARKER = "TEST GUEST: safe to delete (npm run test-guests -- --remove)";

const GUESTS: { fullName: string; status: InvitationStatus; seatAllowance: number; party?: string[]; what: string }[] = [
  { fullName: "Amani Test", status: "sent", seatAllowance: 2, what: "invited, hasn't answered: try the RSVP form" },
  { fullName: "Baraka Test", status: "awaiting_approval", seatAllowance: 1, party: ["Baraka Test", "Plus One Test"], what: "said Yes, waiting for the couple" },
  { fullName: "Chebet Test", status: "approved", seatAllowance: 1, party: ["Chebet Test", "Guest Test"], what: "approved: sees everything" },
  { fullName: "Daudi Test", status: "declined", seatAllowance: 0, party: ["Daudi Test"], what: "said No" },
  { fullName: "Eshe Test", status: "revoked", seatAllowance: 0, what: "invitation withdrawn" },
];

async function main() {
  const db = getDb();
  const [w] = await db.select().from(weddings).where(eq(weddings.slug, config.weddingSlug()));
  if (!w) {
    console.error(`No wedding "${config.weddingSlug()}". Run npm run db:seed first.`);
    process.exit(1);
  }

  const removed = await db
    .delete(invitations)
    .where(and(eq(invitations.weddingId, w.id), eq(invitations.notes, MARKER)))
    .returning({ id: invitations.id });
  if (process.argv.includes("--remove")) {
    console.log(`✓ Removed ${removed.length} test guest(s).`);
    process.exit(0);
  }

  console.log(`\nTest guests for "${w.slug}" (${config.appUrl()}). Open each link in your browser:\n`);
  for (const g of GUESTS) {
    const id = randomUUID();
    const party = g.party ?? [];
    await db.insert(invitations).values({
      id,
      weddingId: w.id,
      fullName: g.fullName,
      status: g.status,
      seatAllowance: g.seatAllowance,
      partySize: Math.max(1, party.length),
      respondedAt: party.length ? new Date() : null,
      approvedAt: g.status === "approved" ? new Date() : null,
      statusBeforeRevoke: g.status === "revoked" ? "sent" : null,
      notes: MARKER,
      inviteTokenHash: hashToken(inviteTokenFor(id, 1)),
    });
    if (party.length) {
      await db.insert(partyMembers).values(party.map((fullName, i) => ({ invitationId: id, fullName, isPrimary: i === 0, sortOrder: i })));
    }
    console.log(`  ${g.fullName.padEnd(12)} ${g.what}\n  ${inviteLink(id, 1)}\n`);
  }
  console.log("Remove them any time with: npm run test-guests -- --remove");
  process.exit(0);
}

void main();
