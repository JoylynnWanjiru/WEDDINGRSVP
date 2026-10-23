// Public teaser (spec §4 "Public"): envelope, names, date, countdown, private-celebration
// note, request-an-invitation form. Names and date only: never venue or programme (§4a).

import type { Metadata } from "next";
import { io } from "next/cache";
import { cache, Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { DismissEnvelope, EnvelopeHero, EnvelopeIntro, EnvelopeProvider } from "@/components/envelope/Envelope";
import { RequestInviteForm } from "@/components/RequestInviteForm";
import { Ornament } from "@/components/ui/Ornament";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getPublicTeaser } from "@/server/services/invitation-page";
import { formatDate, formatTime } from "@/server/utils/dates";
import { shareMetadata } from "../_lib/share";

// The link preview when someone shares the site: names, date, invitation line.
export function generateMetadata(): Promise<Metadata> {
  return shareMetadata();
}

// The envelope overlay is in the static shell: it animates on the first bytes of HTML,
// and only the monogram streams in once the database answers.
export default function PublicPage() {
  return (
    <main className="guest-site flex w-full flex-1 flex-col text-center">
      <EnvelopeProvider
        intro={<EnvelopeIntro address="For our dear guest" monogram={<Suspense fallback={null}><Monogram /></Suspense>} />}
      >
        <Suspense fallback={<TeaserFallback />}>
          <TeaserContent />
        </Suspense>
      </EnvelopeProvider>
    </main>
  );
}

// One database read per request, shared by the monogram slot and the page body.
const loadTeaser = cache(async () => {
  await io(); // request time only: never touch the database while building
  try {
    return await getPublicTeaser(getDb(), config.weddingSlug());
  } catch (err) {
    if (!isAppError(err) || err.code !== "NOT_FOUND") throw err; // real errors go to app/error.tsx
    return null;
  }
});

async function Monogram() {
  const teaser = await loadTeaser();
  return teaser ? teaser.monogram || "Together" : null;
}

/** Prerendered shell: the envelope frame appears instantly while the details load. */
function TeaserFallback() {
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

async function TeaserContent() {
  const teaser = await loadTeaser();
  if (!teaser) return <ComingSoon />;

  const couple = `${teaser.brideName} & ${teaser.groomName}`;
  const date = formatDate(teaser.weddingDate);

  return (
    <>
      <section id="top" className="guest-top" aria-label="Invitation">
        <EnvelopeHero monogram={teaser.monogram}>
          <p className="label text-[0.65rem] text-gold-deep">Together with their families</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-wine sm:text-5xl">
            {teaser.brideName}
            <span className="block font-display text-2xl italic text-gold-deep">&amp;</span>
            {teaser.groomName}
          </h1>
          <p className="label mt-4 text-[0.65rem] text-wine">{date}</p>
        </EnvelopeHero>
      </section>

      <section id="celebration" className="celebration-section" aria-labelledby="names">
        <Ornament />
        <h2 id="names" className="mt-6 font-display text-5xl text-white sm:text-6xl">
          Counting down to forever
        </h2>
        <p className="label mt-4 text-gold">
          {date} · {formatTime(teaser.ceremonyStartAt)}
        </p>
        <div className="mt-8 flex justify-center">
          <Countdown target={teaser.ceremonyStartAt.toISOString()} />
        </div>
      </section>

      <section className="public-private" aria-labelledby="private">
        <Ornament />
        <h2 id="private" className="mt-6 font-display text-3xl text-gold">
          A private celebration
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pearl">
          If you&rsquo;ve been invited, please open the personal link sent to you by email or WhatsApp.
        </p>
      </section>

      {teaser.acceptsRequests ? (
        <section className="public-request text-left" aria-labelledby="request">
          <div className="public-request-inner">
          <p className="label mb-3 text-center text-gold">A note to the couple</p>
          <h2 id="request" className="text-center font-display text-3xl text-white">
            Request an invitation
          </h2>
          <p className="mx-auto mt-2 mb-6 max-w-md text-center text-pearl/80">
            Think you were missed? Let the couple know and they&rsquo;ll be in touch.
          </p>
          <RequestInviteForm />
          </div>
        </section>
      ) : null}

      <footer className="guest-footer">
        <Ornament className="mb-4" />
        <p className="font-display text-xl">{couple}</p>
        <p className="label mt-1 text-[0.65rem]">{date}</p>
      </footer>
    </>
  );
}

function ComingSoon() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
      <DismissEnvelope />
      <Ornament />
      <h1 className="font-display text-4xl">Coming soon</h1>
      <p className="text-wine/80">The invitation is being prepared.</p>
    </section>
  );
}
