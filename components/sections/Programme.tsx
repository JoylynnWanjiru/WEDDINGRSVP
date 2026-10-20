// Order of the day (spec §5), times in EAT for guests anywhere (E15).

import type { ApprovedContent } from "@/server/services/content";
import { formatTime } from "@/server/utils/dates";
import { Section } from "./Section";

export function Programme({ items }: { items: ApprovedContent["programme"] }) {
  if (!items.length) return null;
  // Name the venue on each item only when the day moves between venues.
  const manyVenues = new Set(items.map((i) => i.venue).filter(Boolean)).size > 1;
  return (
    <Section id="programme" eyebrow="The day" title="Order of the day">
      <ol className="relative mx-auto max-w-md border-l border-gold/60 pl-6">
        {items.map((item, i) => (
          <li key={i} className="relative pb-6 last:pb-0">
            <span className="absolute -left-[1.95rem] top-1.5 h-3 w-3 rotate-45 border border-gold-deep bg-ivory" aria-hidden />
            <p className="label text-[0.65rem] text-gold-deep">{formatTime(item.startsAt).replace(" EAT", "")}</p>
            <p className="font-display text-xl">{item.title}</p>
            {item.detail ? <p className="text-sm text-wine/75">{item.detail}</p> : null}
            {manyVenues && item.venue ? <p className="text-xs text-wine/60">{item.venue}</p> : null}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-xs text-wine/60">All times are East Africa Time (EAT).</p>
    </Section>
  );
}
