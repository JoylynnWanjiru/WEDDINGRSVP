// Light ivory section on the dark page (spec §3: wine text on ivory 15.3:1; gold-deep for gold text).

import type { ReactNode } from "react";

export function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="guest-section">
      <div className="guest-section-inner">
      {eyebrow ? <p className="label text-center text-[0.65rem] text-gold-deep">{eyebrow}</p> : null}
      <h2 id={`${id}-title`} className="mt-2 text-center font-display text-4xl">
        {title}
      </h2>
      <div className="guest-section-rule" aria-hidden="true"><span>◆</span></div>
      {children}
      </div>
    </section>
  );
}
