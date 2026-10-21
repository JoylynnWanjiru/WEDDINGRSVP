// Gate pass card (spec §9), shown as a section of the one invitation page (D22).
// The QR is generated on the server from our own URL and contains no personal data.

import { DoveSeal } from "@/components/envelope/DoveSeal";
import { formatDate, formatTime } from "@/server/utils/dates";

export type GatePassData = {
  guestName: string;
  partySize: number;
  arrivedCount: number;
  brideName: string;
  groomName: string;
  weddingDate: string;
  gatesOpenAt: Date;
  qrSvg: string;
  /** Replaces the party line, e.g. "Photographer · team of 3" on a vendor's pass (D25). */
  subtitle?: string;
};

export function GatePass({ pass }: { pass: GatePassData }) {
  const extras = pass.partySize - 1;
  const remaining = pass.partySize - pass.arrivedCount;

  return (
    <section id="pass" aria-labelledby="pass-title" className="w-full scroll-mt-14">
      <article className="mx-auto w-full max-w-md overflow-hidden rounded-sm bg-ivory text-wine shadow-[0_30px_60px_-25px_rgba(0,0,0,0.8)]">
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
          <h2 id="pass-title" className="mt-1 font-display text-3xl">
            {pass.guestName}
          </h2>
          <p className="mt-1 text-lg">{pass.subtitle ?? (extras > 0 ? `+ ${extras} · party of ${pass.partySize}` : "Party of 1")}</p>
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
      <p className="mx-auto mt-4 max-w-md text-center text-sm text-pearl/80">
        Show this QR at the gate. Screenshots are fine: your pass is checked live.
      </p>
    </section>
  );
}
