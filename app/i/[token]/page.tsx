// Personal invitation: ONE page per guest (D22), like the reference site, with a section
// navigation bar. The server decides what this token may see on every request (BR-3).
// D29: the wedding content is shown to every guest; the gate pass only to approved guests.

import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { DismissEnvelope, EnvelopeHero, EnvelopeIntro, EnvelopeProvider, TrackOpen } from "@/components/envelope/Envelope";
import { GatePass } from "@/components/GatePass";
import { HappeningNow } from "@/components/HappeningNow";
import { InvitationNav, type NavItem } from "@/components/InvitationNav";
import { RsvpForm, type RsvpFormProps } from "@/components/RsvpForm";
import { AwaitingApproval, Confirmed, Declined } from "@/components/RsvpStatus";
import { Ornament } from "@/components/ui/Ornament";
import { contentNav, WeddingSections } from "@/components/WeddingSections";
import { getDb } from "@/server/db/client";
import { getGatePass } from "@/server/services/gate";
import { getInvitationPage, type InvitationPage } from "@/server/services/invitation-page";
import { addDays, formatDate, formatDateTime, formatTime, nairobiDate } from "@/server/utils/dates";
import { recordViewAction, submitRsvpAction } from "./actions";

// One database read per request, shared by the envelope slots and the page body.
const loadPage = cache((token: string) => getInvitationPage(getDb(), token));

type Params = PageProps<"/i/[token]">["params"];

// The envelope overlay is outside every Suspense boundary, so it is part of the static
// App Shell and starts animating before the database answers. Only the guest's first name
// and the monogram stream into it, and only for links that may show them (BR-2, BR-4).
export default function InvitationRoute({ params }: PageProps<"/i/[token]">) {
  return (
    <main className="guest-site flex w-full flex-1 flex-col items-center">
      <EnvelopeProvider
        intro={
          <EnvelopeIntro
            address={<Suspense fallback={null}><Addressee params={params} /></Suspense>}
            monogram={<Suspense fallback={null}><Monogram params={params} /></Suspense>}
          />
        }
      >
        <Suspense fallback={<Loading />}>
          <Invitation params={params} />
        </Suspense>
      </EnvelopeProvider>
    </main>
  );
}

async function Addressee({ params }: { params: Params }) {
  const page = await loadPage((await params).token);
  return "guest" in page && page.level !== "not_approved" ? `For ${page.guest.firstName}` : null;
}

async function Monogram({ params }: { params: Params }) {
  const page = await loadPage((await params).token);
  return "teaser" in page ? page.teaser.monogram || "Together" : null;
}

function Loading() {
  return (
    <div className="w-full max-w-2xl animate-pulse px-4 pt-10" aria-label="Loading your invitation">
      <div className="envelope mt-[38%] sm:mt-40">
        <div className="envelope__back" />
        <div className="envelope__front" />
        <div className="envelope__flap" />
      </div>
      <p className="label mt-8 text-center text-wine/70">Preparing your invitation…</p>
    </div>
  );
}

type Full = Extract<InvitationPage, { level: "invited" | "declined" | "approved" }>;

async function Invitation({ params }: { params: Params }) {
  const { token } = await params; // request-time: the suspension point
  const page = await loadPage(token);

  if (page.level === "public") redirect("/"); // BR-4: an unknown link behaves like no link
  if (page.level === "revoked") return <Neutral title="This invitation is no longer active" />;
  if (page.level === "not_approved") {
    return (
      <Neutral
        title={`Dear ${page.guest.firstName}`}
        text="The couple is unable to confirm your attendance. If you have any questions, please contact them directly."
      />
    );
  }

  const { teaser, guest } = page;
  const couple = `${teaser.brideName} & ${teaser.groomName}`;
  const date = formatDate(teaser.weddingDate);
  const content = page.content;
  const approved = page.level === "approved";
  const pass = approved ? await getGatePass(getDb(), token) : null; // BR-1: the pass stays approved-only

  // On the wedding day (and the after-midnight send-off) the live banner leads the page.
  const now = new Date(); // request time: awaiting params above made this render dynamic
  const today = nairobiDate(now);
  const weddingDay = today === teaser.weddingDate || today === addDays(teaser.weddingDate, 1);

  const nav: NavItem[] = [{ href: "#top", label: "Invitation" }, ...contentNav(content)];
  if (pass) nav.push({ href: "#pass", label: "Gate pass" });
  nav.push({ href: "#rsvp", label: "RSVP" });

  return (
    <>
      <InvitationNav items={nav} />
      <div className="guest-shell">
      {approved && weddingDay ? (
        <div className="happening-strip">
          <HappeningNow programme={content.programme} serverNow={now.toISOString()} />
        </div>
      ) : null}

      <section id="top" className="guest-top" aria-label="Your invitation">
        <TrackOpen onOpen={recordViewAction.bind(null, token)} />
        <EnvelopeHero monogram={teaser.monogram}>
          <p className="label hero-for">For {guest.fullName}</p>
          <p className="hero-lede font-display">You are warmly invited to celebrate the wedding of</p>
          <h1 className="font-display">
            {teaser.brideName}
            <span>&amp;</span>
            {teaser.groomName}
          </h1>
          <p className="label hero-date">{date}</p>
        </EnvelopeHero>
      </section>

      <section id="celebration" className="celebration-section" aria-labelledby="welcome">
        <p className="label">Until we say I do</p>
        <h2 id="welcome" className="font-display">
          Counting down to <em>forever</em>
        </h2>
        <p className="label celebration-when">
          {date} · {formatTime(teaser.ceremonyStartAt)}
        </p>
        <div className="flex justify-center">
          <Countdown target={teaser.ceremonyStartAt.toISOString()} />
        </div>
      </section>

      {approved ? (
        <Confirmed partySize={guest.partySize} />
      ) : guest.awaitingApproval ? (
        <AwaitingApproval partySize={guest.partySize} />
      ) : page.level === "declined" ? (
        <Declined />
      ) : null}

      <WeddingSections content={content} />
      {pass ? <GatePass pass={pass} /> : null}

      <RsvpSection token={token} page={page} />

      <footer className="guest-footer guest-footer--photo">
        <Ornament className="mb-6" />
        <p className="label footer-kicker">With love</p>
        <p className="font-display footer-names">{couple}</p>
        <p className="label footer-date">{date}</p>
        <a href="#top" className="label footer-top">
          Back to top
        </a>
      </footer>
      </div>
    </>
  );
}

function RsvpSection({ token, page }: { token: string; page: Full }) {
  const { guest, rsvp } = page;
  const primary = rsvp.members.find((m) => m.isPrimary);
  const toMember = (m: (typeof rsvp.members)[number]) => ({ fullName: m.fullName, isChild: m.isChild, dietary: m.dietary, dietaryNotes: m.dietaryNotes ?? "" });

  const initial: RsvpFormProps["initial"] = {
    attending: rsvp.attending,
    primary: primary ? toMember(primary) : { fullName: guest.fullName, isChild: false, dietary: "none", dietaryNotes: "" },
    extras: rsvp.members.filter((m) => !m.isPrimary).map(toMember),
    events: rsvp.events.filter((e) => e.attending).map((e) => e.event),
    message: rsvp.message ?? "",
  };
  const answered = rsvp.attending !== null;

  return (
    <section id="rsvp" aria-labelledby="rsvp-title" className="guest-rsvp">
      <header className="guest-rsvp-head">
        <p className="label">Répondez s&rsquo;il vous plaît</p>
        <h2 id="rsvp-title" className="font-display">
          {answered ? "Your response" : "Will you join us?"}
        </h2>
        <Ornament className="my-5" />
        <p>{rsvp.open ? `Kindly respond by ${formatDateTime(rsvp.deadline)}.` : "The RSVP deadline has passed."}</p>
      </header>
      <div className="guest-rsvp-inner">

      {answered ? <ResponseSummary members={rsvp.members} attending={rsvp.attending!} /> : null}

      {rsvp.open ? (
        answered ? (
          <details className="mt-6">
            <summary className="label rsvp-change">Change my response</summary>
            <div className="mt-6">
              <Form token={token} guest={guest} rsvp={rsvp} initial={initial} />
            </div>
          </details>
        ) : (
          <Form token={token} guest={guest} rsvp={rsvp} initial={initial} />
        )
      ) : (
        <p className="mt-6 text-center">Please contact the couple if anything has changed.</p>
      )}
      </div>
    </section>
  );
}

function Form({ token, guest, rsvp, initial }: { token: string; guest: Full["guest"]; rsvp: Full["rsvp"]; initial: RsvpFormProps["initial"] }) {
  return (
    <RsvpForm
      action={submitRsvpAction.bind(null, token)}
      seatAllowance={guest.seatAllowance}
      weddingEvents={rsvp.weddingEvents}
      hasEmail={guest.hasEmail}
      hasPhone={guest.hasPhone}
      initial={initial}
    />
  );
}

const DIETARY_LABEL: Record<string, string> = {
  none: "",
  vegetarian: "vegetarian",
  vegan: "vegan",
  halal: "halal",
  gluten_free: "gluten-free",
  other: "other",
};

function ResponseSummary({ members, attending }: { members: Full["rsvp"]["members"]; attending: boolean }) {
  if (!attending) return <p className="text-center font-display text-2xl italic">You&rsquo;ve let us know you can&rsquo;t attend.</p>;
  return (
    <ul className="rsvp-summary">
      <li className="label rsvp-summary-head">Joyfully attending</li>
      {members.map((m, i) => (
        <li key={i}>
          <span className="font-display">
            {m.fullName}
            {m.isChild ? <span className="ml-2 font-sans text-xs text-wine/70">(child)</span> : null}
          </span>
          <span className="text-sm text-wine/70">
            {[DIETARY_LABEL[m.dietary], m.dietaryNotes].filter(Boolean).join(": ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Neutral({ title, text }: { title: string; text?: string }) {
  return (
    <section className="neutral-page">
      <DismissEnvelope />
      <Ornament />
      <h1 className="font-display">{title}</h1>
      {text ? <p>{text}</p> : null}
    </section>
  );
}
