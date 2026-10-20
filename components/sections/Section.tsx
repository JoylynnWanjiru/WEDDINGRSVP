// Light ivory section on the dark page (spec §3: wine text on ivory 15.3:1; gold-deep for gold text).

import type { ReactNode } from "react";

export function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="w-full scroll-mt-14 rounded-sm bg-ivory px-5 py-10 text-wine shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)] sm:px-10">
      {eyebrow ? <p className="label text-center text-[0.65rem] text-gold-deep">{eyebrow}</p> : null}
      <h2 id={`${id}-title`} className="mt-2 text-center font-display text-4xl">
        {title}
      </h2>
      <div className="mx-auto mt-3 mb-8 h-px w-16 bg-gold" aria-hidden />
      {children}
    </section>
  );
}
