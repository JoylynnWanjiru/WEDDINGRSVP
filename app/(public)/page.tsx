// Public page (D29, replacing the teaser of spec §4 "Public"): the whole invitation for anyone with
// the address: envelope, names, date, countdown, story, programme, venue, dress code, FAQ, contacts,
// and an RSVP form. After a visitor RSVPs, this device remembers them (a cookie holding their
// personal link) and the RSVP section shows their gate pass instead, or their status.
// The gate pass is still approved-only (BR-1): it comes from getGatePass(), which requires approval.

import type { Metadata } from "next";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { cache, Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { DismissEnvelope, EnvelopeHero, EnvelopeIntro, EnvelopeProvider, TrackOpen } from "@/components/envelope/Envelope";
import { GatePass } from "@/components/GatePass";
import { GuestLinkCard } from "@/components/GuestLinkCard";
import { InvitationNav, type NavItem } from "@/components/InvitationNav";
import { RsvpForm } from "@/components/RsvpForm";
import { AwaitingApproval, Declined } from "@/components/RsvpStatus";
import { Ornament } from "@/components/ui/Ornament";
import { contentNav, WeddingSections } from "@/components/WeddingSections";
import { inviteLink, looksLikeInviteToken } from "@/server/auth/tokens";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getAccess } from "@/server/services/access";
import { getGatePass } from "@/server/services/gate";
import { getPublicPage, type PublicPage as PublicPageData } from "@/server/services/invitation-page";
import { GUEST_LINK_COOKIE } from "@/server/services/public-rsvp";
import { formatDate, formatDateTime, formatTime } from "@/server/utils/dates";
import { shareMetadata } from "../_lib/share";
import { publicRsvpAction, recordPublicVisitAction } from "./actions";

// The link preview when someone shares the site: names, date, invitation line.
export function generateMetadata(): Promise<Metadata> {
  return shareMetadata();
}

// The envelope overlay is in the static shell: it animates on the first bytes of HTML,
// and only the monogram streams in once the database answers.
export default function PublicPage() {
  return (
    <main className="guest-site flex w-full flex-1 flex-col">
      <EnvelopeProvider
        intro={<EnvelopeIntro address="For our dear guest" monogram={<Suspense fallback={null}><Monogram /></Suspense>} />}
      >
        <Suspense fallback={<PageFallback />}>
          <PublicContent />
        </Suspense>
      </EnvelopeProvider>
    </main>
  );
}

// One database read per request, shared by the monogram slot and the page body.
const loadPage = cache(async (): Promise<PublicPageData | null> => {
  await io(); // request time only: never touch the database while building
  try {
    return await getPublicPage(getDb(), config.weddingSlug());
  } catch (err) {
    if (!isAppError(err) || err.code !== "NOT_FOUND") throw err; // real errors go to app/error.tsx
    return null;
  }
});

/** D29: the guest this device RSVPed as, if any (and only for this wedding). */
async function loadGuest() {
  const token = (await cookies()).get(GUEST_LINK_COOKIE)?.value;
  if (!looksLikeInviteToken(token)) return null;
  const db = getDb();
  const access = await getAccess(db, token);
  if (access.level === "public" || access.wedding.slug !== config.weddingSlug()) return null;
  const inv = access.invitation;
  return {
    level: access.level,
    firstName: inv.fullName.trim().split(/\s+/)[0],
    partySize: inv.partySize,
    awaitingApproval: inv.status === "awaiting_approval",
    link: inviteLink(inv.id, inv.inviteTokenVersion),
    pass: access.level === "approved" ? await getGatePass(db, token) : null, // BR-1
  };
}

async function Monogram() {
  const page = await loadPage();
  return page ? page.teaser.monogram || "Together" : null;
}

/** Prerendered shell: the envelope frame appears instantly while the details load. */
function PageFallback() {
  return (
    <div className="w-full animate-pulse pt-10">
      <div className="envelope mt-[38%] sm:mt-40">
        <div className="envelope__back" />
        <div className="envelope__front" />
        <div className="envelope__flap" />
      </div>
    </div>
  );
}

async function PublicContent() {
  const [page, guest] = await Promise.all([loadPage(), loadGuest()]);
  if (!page) return <ComingSoon />;

  const { teaser, content, rsvp } = page;
  const couple = `${teaser.brideName} & ${teaser.groomName}`;
  const date = formatDate(teaser.weddingDate);
  const nav: NavItem[] = [{ href: "#top", label: "Invitation" }, ...contentNav(content), { href: "#rsvp", label: guest?.pass ? "Gate pass" : "RSVP" }];

  return (
    <>
      <InvitationNav items={nav} />
      <div className="guest-shell">
        <section id="top" className="guest-top" aria-label="Invitation">
          <TrackOpen onOpen={recordPublicVisitAction} />
          <EnvelopeHero monogram={teaser.monogram}>
            <p className="label hero-for">{guest ? `For ${guest.firstName}` : "Together with their families"}</p>
            <p className="hero-lede font-display">request the pleasure of your company at their wedding</p>
            <h1 className="font-display">
              {teaser.brideName}
              <span>&amp;</span>
              {teaser.groomName}
            </h1>
            <p className="label hero-date">{date}</p>
          </EnvelopeHero>
        </section>

        <section id="celebration" className="celebration-section" aria-labelledby="names">
          <p className="label">Until we say I do</p>
          <h2 id="names" className="font-display">
            Counting down to <em>forever</em>
          </h2>
          <p className="label celebration-when">
            {date} · {formatTime(teaser.ceremonyStartAt)}
          </p>
          <div className="flex justify-center">
            <Countdown target={teaser.ceremonyStartAt.toISOString()} />
          </div>
        </section>

        <WeddingSections content={content} />

        <RsvpSlot guest={guest} rsvp={rsvp} />

        <footer className="guest-footer guest-footer--photo">
          <Ornament className="mb-6" />
          <p className="label footer-kicker">With love</p>
          <p className="font-display footer-names">{couple}</p>
          <p className="label footer-date">{date}</p>
          <a href="#top" className="label footer-top">
            Back to top
          </a>
          {/* D29: the device stamp is a cookie, so say so. */}
          <p className="footer-cookie">This site uses a cookie to remember your device and your RSVP. Nothing else is tracked.</p>
        </footer>
      </div>
    </>
  );
}

type Guest = Awaited<ReturnType<typeof loadGuest>>;

/** D29: the RSVP form until this device has answered; then the gate pass, or their status, in its place. */
function RsvpSlot({ guest, rsvp }: { guest: Guest; rsvp: PublicPageData["rsvp"] }) {
  if (guest?.pass) {
    return (
      <div id="rsvp" className="scroll-mt-14">
        <GatePass pass={guest.pass} />
        <div className="pass-section !pt-0">
          <GuestLinkCard link={guest.link} firstName={guest.firstName} />
        </div>
      </div>
    );
  }

  if (guest && (guest.level === "invited" || guest.level === "declined")) {
    return (
      <section id="rsvp" className="guest-rsvp" aria-label="Your response">
        {guest.level === "declined" ? <Declined /> : guest.awaitingApproval ? <AwaitingApproval partySize={guest.partySize} /> : null}
        <div className="mx-auto max-w-xl">
          <GuestLinkCard link={guest.link} firstName={guest.firstName} />
        </div>
      </section>
    );
  }

  if (guest) {
    // Revoked or not approved: no pass, no details about why. They can still forget this device.
    return (
      <section id="rsvp" className="guest-rsvp" aria-label="Your response">
        <p className="mx-auto max-w-md text-center">Please contact the couple about your attendance.</p>
        <div className="mx-auto mt-6 max-w-xl">
          <GuestLinkCard link={guest.link} firstName={guest.firstName} />
        </div>
      </section>
    );
  }

  return (
    <section id="rsvp" aria-labelledby="rsvp-title" className="guest-rsvp">
      <header className="guest-rsvp-head">
        <p className="label">Répondez s&rsquo;il vous plaît</p>
        <h2 id="rsvp-title" className="font-display">
          Will you join us?
        </h2>
        <Ornament className="my-5" />
        <p>{rsvp.open ? `Kindly respond by ${formatDateTime(rsvp.deadline)}.` : "The RSVP deadline has passed."}</p>
      </header>
      <div className="guest-rsvp-inner">
        {rsvp.open ? (
          <RsvpForm
            action={publicRsvpAction}
            publicMode
            seatAllowance={rsvp.seatAllowance}
            weddingEvents={rsvp.weddingEvents}
            hasEmail={false}
            hasPhone={false}
            initial={{ attending: null, primary: { fullName: "", isChild: false, dietary: "none", dietaryNotes: "" }, extras: [], events: [], message: "" }}
          />
        ) : (
          <p className="text-center">Please contact the couple if you&rsquo;d still like to come.</p>
        )}
      </div>
    </section>
  );
}

function ComingSoon() {
  return (
    <section className="neutral-page">
      <DismissEnvelope />
      <Ornament />
      <h1 className="font-display">Coming soon</h1>
      <p>The invitation is being prepared.</p>
    </section>
  );
}
