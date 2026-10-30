// Gate pass card (spec §9), shown as a section of the one invitation page (D22).
// The QR is generated on the server from our own URL and contains no personal data.
// Styled as a ticket: wine header, ivory stub, perforated tear line before the date row.

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
    <section id="pass" aria-labelledby="pass-title" className="pass-section w-full">
      <p className="label pass-eyebrow">Your gate pass</p>
      <article className="pass-ticket">
        <header className="pass-head">
          <DoveSeal id="pass-seal" className="h-14 w-14 shrink-0" />
          <div>
            <p className="label">Admission</p>
            <p className="font-display pass-couple">
              {pass.brideName} <em>&amp;</em> {pass.groomName}
            </p>
          </div>
        </header>

        <div className="pass-body">
          <p className="label">Admit</p>
          <h2 id="pass-title" className="font-display">
            {pass.guestName}
          </h2>
          <p className="pass-party">{pass.subtitle ?? (extras > 0 ? `+ ${extras} · party of ${pass.partySize}` : "Party of 1")}</p>
          <div
            className="pass-qr [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label="QR code to show at the gate"
            dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
          />
          {pass.arrivedCount > 0 ? (
            <p className="pass-arrived">
              {remaining > 0 ? `${pass.arrivedCount} of ${pass.partySize} checked in. ${remaining} still to arrive.` : "Everyone has checked in. Welcome!"}
            </p>
          ) : null}
        </div>

        <dl className="pass-foot">
          <div>
            <dt className="label">Date</dt>
            <dd>{formatDate(pass.weddingDate)}</dd>
          </div>
          <div>
            <dt className="label">Gates open</dt>
            <dd>{formatTime(pass.gatesOpenAt)}</dd>
          </div>
        </dl>
      </article>
      <p className="pass-note">Show this QR at the gate. Screenshots are fine: your pass is checked live.</p>
    </section>
  );
}
