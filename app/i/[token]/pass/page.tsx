// Gate pass (spec §9): name, party size, QR, date, gate time. Approved guests only (BR-1);
// anyone else is sent back to their invitation, which shows their current status.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DoveSeal } from "@/components/envelope/DoveSeal";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getGatePass } from "@/server/services/gate";
import { formatDate, formatTime } from "@/server/utils/dates";

export const metadata = { title: "Gate pass" };

export default function PassRoute({ params }: PageProps<"/i/[token]/pass">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 py-8">
      <Suspense fallback={<p className="label mt-24 text-pearl/70">Loading your pass…</p>}>
        <Pass params={params} />
      </Suspense>
    </main>
  );
}

async function Pass({ params }: { params: PageProps<"/i/[token]/pass">["params"] }) {
  const { token } = await params;
  let pass: Awaited<ReturnType<typeof getGatePass>>;
  try {
    pass = await getGatePass(getDb(), token);
  } catch (err) {
    if (isAppError(err) && err.code === "FORBIDDEN") redirect(`/i/${token}`); // §4 Routes
    throw err;
  }

  const extras = pass.partySize - 1;
  const remaining = pass.partySize - pass.arrivedCount;

  return (
    <>
      <article className="w-full overflow-hidden rounded-sm bg-ivory text-wine shadow-[0_30px_60px_-25px_rgba(0,0,0,0.8)]" aria-label="Gate pass">
        <header className="flex items-center gap-3 bg-wine px-5 py-4 text-gold">
          <DoveSeal id="pass-seal" className="h-12 w-12 shrink-0" />
          <div>
            <p className="label text-[0.6rem] text-pearl/80">Gate pass</p>
            <p className="font-display text-xl leading-tight">
              {pass.brideName} &amp; {pass.groomName}
            </p>
          </div>
        </header>

        <div className="px-5 pt-6 pb-4 text-center">
          <p className="label text-[0.6rem] text-gold-deep">Admit</p>
          <h1 className="mt-1 font-display text-3xl">{pass.guestName}</h1>
          <p className="mt-1 text-lg">{extras > 0 ? `+ ${extras} · party of ${pass.partySize}` : "Party of 1"}</p>

          {/* The QR is generated on the server from our own URL; it contains no personal data. */}
          <div
            className="mx-auto mt-5 w-full max-w-64 rounded-sm bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label="QR code to show at the gate"
            dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
          />

          {pass.arrivedCount > 0 ? (
            <p className="mt-4 rounded-sm bg-gold/20 px-3 py-2 text-sm">
              {remaining > 0 ? `${pass.arrivedCount} of ${pass.partySize} checked in. ${remaining} still to arrive.` : "Everyone has checked in. Welcome!"}
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 border-t border-dashed border-wine/25 text-center">
          <div className="border-r border-dashed border-wine/25 px-3 py-4">
            <dt className="label text-[0.55rem] text-gold-deep">Date</dt>
            <dd className="mt-1 text-sm">{formatDate(pass.weddingDate)}</dd>
          </div>
          <div className="px-3 py-4">
            <dt className="label text-[0.55rem] text-gold-deep">Gates open</dt>
            <dd className="mt-1 text-sm">{formatTime(pass.gatesOpenAt)}</dd>
          </div>
        </dl>
      </article>

      <div className="mt-6 space-y-3 text-center text-sm text-pearl/80">
        <p>Show this QR at the gate. Screenshots are fine: your pass is checked live.</p>
        <p className="text-xs text-pearl/60">
          Tip: add this page to your home screen (Share → <span className="whitespace-nowrap">Add to Home Screen</span>) to find it quickly on the day.
        </p>
      </div>

      <nav className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/i/${token}/day`} className="label inline-flex min-h-11 items-center rounded-sm bg-gold px-5 py-3 text-wine">
          On the day
        </Link>
        <Link href={`/i/${token}`} className="label inline-flex min-h-11 items-center rounded-sm border border-gold/60 px-5 py-3 text-gold">
          Back to invitation
        </Link>
      </nav>
    </>
  );
}
