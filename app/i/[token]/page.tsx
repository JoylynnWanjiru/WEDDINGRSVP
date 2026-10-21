// Personal invitation: ONE page per guest (D22), like the reference site, with a section
// navigation bar. The server decides what this token may see on every request (BR-3);
// locked sections, including the gate pass, are only rendered (and fetched) for approved guests.

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { Envelope } from "@/components/envelope/Envelope";
import { GatePass } from "@/components/GatePass";
import { HappeningNow } from "@/components/HappeningNow";
import { InvitationNav, type NavItem } from "@/components/InvitationNav";
import { RsvpForm, type RsvpFormProps } from "@/components/RsvpForm";
import { AwaitingApproval, Confirmed, Declined, DetailsAfterApproval } from "@/components/RsvpStatus";
import { Contacts } from "@/components/sections/Contacts";
import { DressCode } from "@/components/sections/DressCode";
import { Faq } from "@/components/sections/Faq";
import { GoodToKnow } from "@/components/sections/GoodToKnow";
import { Programme } from "@/components/sections/Programme";
import { Story } from "@/components/sections/Story";
import { Venues } from "@/components/sections/VenueCard";
import { Ornament } from "@/components/ui/Ornament";
import { getDb } from "@/server/db/client";
import { getGatePass } from "@/server/services/gate";
import { getInvitationPage, type InvitationPage } from "@/server/services/invitation-page";
import { addDays, formatDate, formatDateTime, formatTime, nairobiDate } from "@/server/utils/dates";
import { recordViewAction } from "./actions";

export default function InvitationRoute({ params }: PageProps<"/i/[token]">) {
  return (
    <main className="guest-site flex w-full flex-1 flex-col items-center">
      <Suspense fallback={<Loading />}>
        <Invitation params={params} />
      </Suspense>
    </main>
  );
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

async function Invitation({ params }: { params: PageProps<"/i/[token]">["params"] }) {
  const { token } = await params; // request-time: the suspension point
  const page = await getInvitationPage(getDb(), token);

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
  const approved = page.level === "approved" && page.content ? page.content : null;
  const pass = approved ? await getGatePass(getDb(), token) : null;

  // On the wedding day (and the after-midnight send-off) the live banner leads the page.
  const now = new Date(); // request time: awaiting params above made this render dynamic
  const today = nairobiDate(now);
  const weddingDay = today === teaser.weddingDate || today === addDays(teaser.weddingDate, 1);

  const nav: NavItem[] = [{ href: "#top", label: "Invitation" }];
  if (approved) {
    if (approved.story || approved.photos.some((p) => p.section === "story")) nav.push({ href: "#story", label: "Our story" });
    nav.push({ href: "#programme", label: "The day" }, { href: "#details", label: "Details" }, { href: "#pass", label: "Gate pass" });
  }
  nav.push({ href: "#rsvp", label: "RSVP" });

  return (
    <>
      <InvitationNav items={nav} />
      <div className="guest-shell">
      {approved && weddingDay ? (
        <div className="w-full pt-6">
          <HappeningNow programme={approved.programme} serverNow={now.toISOString()} />
        </div>
      ) : null}

      <section id="top" className="guest-top" aria-label="Your invitation">
        <Envelope addressedTo={`For ${guest.firstName}`} monogram={teaser.monogram} onOpen={recordViewAction.bind(null, token)}>
          <p className="label text-[0.6rem] text-gold-deep">For {guest.fullName}</p>
          <p className="mt-3 font-display text-lg italic text-wine/80">You&rsquo;re invited to our wedding</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-wine sm:text-5xl">
            {teaser.brideName}
            <span className="block text-2xl italic text-gold-deep">&amp;</span>
            {teaser.groomName}
          </h1>
          <p className="label mt-3 text-[0.6rem] text-wine">{date}</p>
        </Envelope>
      </section>

      <section id="celebration" className="celebration-section" aria-labelledby="welcome">
        <Ornament />
        <h2 id="welcome" className="mt-5 font-display text-4xl sm:text-5xl">
          Counting down to forever
        </h2>
        <p className="label mt-3 text-gold">
          {date} · {formatTime(teaser.ceremonyStartAt)}
        </p>
        <div className="mt-6 flex justify-center">
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

      {approved && pass ? (
        <>
          <Story title={approved.storyTitle} story={approved.story} photos={approved.photos} />
          <Programme items={approved.programme} />
          <div id="details" className="guest-details">
            <Venues venues={approved.venues} />
            <DressCode dressCode={approved.dressCode} />
            <GoodToKnow contributionInfo={approved.contributionInfo} />
            <Faq items={approved.faq} />
            <Contacts contacts={approved.contacts} />
          </div>
          <GatePass pass={pass} />
        </>
      ) : (
        <DetailsAfterApproval />
      )}

      <RsvpSection token={token} page={page} />

      <footer className="guest-footer">
        <Ornament className="mb-4" />
        <p className="font-display text-xl">With love, {couple}</p>
        <p className="label mt-1 text-[0.65rem]">{date}</p>
        <a href="#top" className="label mt-4 inline-block text-[0.6rem] text-gold underline underline-offset-4">
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
      <div className="guest-rsvp-inner">
      <p className="label text-center text-gold-deep">A note to the couple</p>
      <h2 id="rsvp-title" className="text-center font-display text-4xl">
        {answered ? "Your response" : "Will you join us?"}
      </h2>
      <p className="mt-2 text-center text-sm text-wine/70">
        {rsvp.open ? `Kindly respond by ${formatDateTime(rsvp.deadline)}.` : "The RSVP deadline has passed."}
      </p>
      <div className="mx-auto mt-3 mb-8 h-px w-16 bg-gold" aria-hidden />

      {answered ? <ResponseSummary members={rsvp.members} attending={rsvp.attending!} /> : null}

      {rsvp.open ? (
        answered ? (
          <details className="mt-6">
            <summary className="label min-h-11 cursor-pointer text-center text-gold-deep underline underline-offset-4">Change my response</summary>
            <div className="mt-6">
              <Form token={token} guest={guest} rsvp={rsvp} initial={initial} />
            </div>
          </details>
        ) : (
          <Form token={token} guest={guest} rsvp={rsvp} initial={initial} />
        )
      ) : (
        <p className="text-center">Please contact the couple if anything has changed.</p>
      )}
      </div>
    </section>
  );
}

function Form({ token, guest, rsvp, initial }: { token: string; guest: Full["guest"]; rsvp: Full["rsvp"]; initial: RsvpFormProps["initial"] }) {
  return (
    <RsvpForm
      token={token}
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
  if (!attending) return <p className="text-center text-lg">You&rsquo;ve let us know you can&rsquo;t attend.</p>;
  return (
    <ul className="mx-auto max-w-md divide-y divide-wine/10 rounded-sm border border-wine/15 bg-white">
      {members.map((m, i) => (
        <li key={i} className="flex items-center justify-between px-4 py-3">
          <span>
            {m.fullName}
            {m.isChild ? <span className="ml-2 text-xs text-wine/60">(child)</span> : null}
          </span>
          <span className="text-sm text-wine/60">
            {[DIETARY_LABEL[m.dietary], m.dietaryNotes].filter(Boolean).join(": ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Neutral({ title, text }: { title: string; text?: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <Ornament />
      <h1 className="font-display text-4xl text-wine">{title}</h1>
      {text ? <p className="max-w-sm text-wine/80">{text}</p> : null}
    </section>
  );
}
