// Day-of page (N2, spec §5): happening now / next, full programme, directions, contacts.
// Approved guests only (BR-1).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HappeningNow } from "@/components/HappeningNow";
import { Contacts } from "@/components/sections/Contacts";
import { Programme } from "@/components/sections/Programme";
import { Venues } from "@/components/sections/VenueCard";
import { Ornament } from "@/components/ui/Ornament";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getDayOfPage } from "@/server/services/day-of";
import { formatDate, formatTime } from "@/server/utils/dates";

export const metadata = { title: "On the day" };

export default function DayRoute({ params }: PageProps<"/i/[token]/day">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-8 px-4 py-8">
      <Suspense fallback={<p className="label mt-24 text-pearl/70">Loading the day…</p>}>
        <Day params={params} />
      </Suspense>
    </main>
  );
}

async function Day({ params }: { params: PageProps<"/i/[token]/day">["params"] }) {
  const { token } = await params;
  let day: Awaited<ReturnType<typeof getDayOfPage>>;
  try {
    day = await getDayOfPage(getDb(), token);
  } catch (err) {
    if (isAppError(err) && err.code === "FORBIDDEN") redirect(`/i/${token}`);
    throw err;
  }
  const now = new Date(); // request time: params above already made this render dynamic

  return (
    <>
      <header className="text-center">
        <p className="label text-gold">On the day</p>
        <h1 className="mt-2 font-display text-4xl">
          {day.brideName} &amp; {day.groomName}
        </h1>
        <p className="label mt-2 text-[0.65rem] text-pearl/80">
          {formatDate(day.weddingDate)} · gates open {formatTime(day.gatesOpenAt)}
        </p>
        <Ornament className="mt-5" />
      </header>

      <HappeningNow programme={day.programme} serverNow={now.toISOString()} />

      <Link
        href={`/i/${token}/pass`}
        className="label inline-flex min-h-12 w-full items-center justify-center rounded-sm bg-gold px-6 py-3 text-wine sm:w-auto"
      >
        Show my gate pass · party of {day.partySize}
      </Link>

      <Programme items={day.programme} />
      <Venues venues={day.venues} />
      <Contacts contacts={day.contacts} />

      <Link href={`/i/${token}`} className="label text-gold underline underline-offset-4">
        Back to invitation
      </Link>
    </>
  );
}
