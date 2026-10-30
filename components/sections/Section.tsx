// Light ivory section on the dark page (spec §3: wine text on ivory 15.3:1; gold-deep for gold text).
// `split` puts the heading in a column beside the content on wide screens (stacked on phones),
// so long lists (the programme, FAQ) read like an editorial page instead of one centred column.

import type { ReactNode } from "react";
import { Ornament } from "@/components/ui/Ornament";

export function Section({
  id,
  eyebrow,
  title,
  intro,
  layout = "center",
  children,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  layout?: "center" | "split";
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="guest-section" data-layout={layout}>
      <div className="guest-section-inner">
        <header className="sec-head">
          {eyebrow ? <p className="label sec-eyebrow">{eyebrow}</p> : null}
          <h2 id={`${id}-title`} className="font-display">
            {title}
          </h2>
          <Ornament className="sec-rule" />
          {intro ? <p className="sec-intro">{intro}</p> : null}
        </header>
        <div className="sec-body">{children}</div>
      </div>
    </section>
  );
}
