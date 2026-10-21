// A vendor's own page (D25): working info only. Arrival time and instructions, the team's
// gate pass, the programme, venues with directions and the couple's contacts. Never the
// story, photos, FAQ, dress code or anything about guests. The server checks the link on
// every request (BR-3); an unknown or removed vendor's link behaves like no link (BR-4).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GatePass } from "@/components/GatePass";
import { InvitationNav } from "@/components/InvitationNav";
import { Contacts } from "@/components/sections/Contacts";
import { Programme } from "@/components/sections/Programme";
import { Venues } from "@/components/sections/VenueCard";
import { Ornament } from "@/components/ui/Ornament";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getVendorPage, type VendorPage } from "@/server/services/vendor-page";
import { formatDate, formatDateTime, formatTime } from "@/server/utils/dates";

export const metadata: Metadata = { title: "Vendor information", robots: { index: false, follow: false } };

export default function VendorRoute({ params }: PageProps<"/vendor/[token]">) {
  return (
    <main className="guest-site flex w-full flex-1 flex-col items-center">
      <Suspense fallback={<p className="label py-24 text-center text-wine/70">Loading…</p>}>
        <Vendor params={params} />
      </Suspense>
    </main>
  );
}

async function load(token: string): Promise<VendorPage | null> {
  try {
    return await getVendorPage(getDb(), token);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

async function Vendor({ params }: { params: PageProps<"/vendor/[token]">["params"] }) {
  const { token } = await params; // request-time: the suspension point
  const page = await load(token);
  if (!page) redirect("/"); // BR-4

  const { wedding, vendor: v, pass } = page;
  const team = v.staffCount === 1 ? "1 person" : `team of ${v.staffCount}`;

  return (
    <>
      <InvitationNav
        items={[
          { href: "#top", label: "Arrival" },
          { href: "#pass", label: "Gate pass" },
          { href: "#programme", label: "The day" },
          { href: "#venue", label: "Venue" },
          { href: "#contacts", label: "Contacts" },
        ]}
      />
      <div className="guest-shell">
        <section id="top" className="celebration-section" aria-labelledby="vendor-title">
          <Ornament />
          <p className="label mt-5">Vendor information</p>
          <h1 id="vendor-title" className="mt-3 font-display text-4xl text-wine sm:text-5xl">
            {wedding.brideName} &amp; {wedding.groomName}
          </h1>
          <p className="label mt-3 text-gold-deep">{formatDate(wedding.weddingDate)}</p>

          <dl className="mx-auto mt-8 grid max-w-md gap-3 text-left">
            <Row label="For">
              {v.company} · {v.role}
              {v.contactName ? ` (${v.contactName})` : ""}
            </Row>
            <Row label="Please arrive by">{v.arriveAt ? formatDateTime(v.arriveAt) : "The couple will confirm your arrival time."}</Row>
            <Row label="Guests' gates open">{formatTime(page.gatesOpenAt)}</Row>
            <Row label="Your team">
              {team} · {v.mealCount === 1 ? "1 meal" : `${v.mealCount} meals`}
            </Row>
            {v.instructions ? <Row label="Notes from the couple">{v.instructions}</Row> : null}
          </dl>
        </section>

        <GatePass
          pass={{
            guestName: v.company,
            subtitle: `${v.role} · ${team}`,
            partySize: pass.staffCount,
            arrivedCount: pass.arrivedCount,
            brideName: wedding.brideName,
            groomName: wedding.groomName,
            weddingDate: wedding.weddingDate,
            gatesOpenAt: page.gatesOpenAt,
            qrSvg: pass.qrSvg,
          }}
        />
        <p className="mx-auto max-w-md px-4 pb-10 text-center text-sm text-wine/80">
          One pass for the whole team: the usher admits up to {v.staffCount}. People arriving later can use the same pass.
        </p>

        <Programme items={page.programme} />
        <div id="details" className="guest-details">
          <Venues venues={page.venues} />
          <Contacts contacts={page.contacts} />
        </div>

        <footer className="guest-footer">
          <Ornament className="mb-4" />
          <p className="font-display text-xl">
            Thank you for being part of our day. {wedding.brideName} &amp; {wedding.groomName}
          </p>
          <a href="#top" className="label mt-2 inline-flex min-h-11 items-center px-3 text-[0.6rem] text-gold underline underline-offset-4">
            Back to top
          </a>
        </footer>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-wine/15 bg-white px-4 py-3">
      <dt className="label text-[0.6rem] text-gold-deep">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
