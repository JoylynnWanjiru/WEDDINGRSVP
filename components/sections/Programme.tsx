// Order of the day (spec §5), times in EAT for guests anywhere (E15).
// A centred timeline: time on the left, a dot on the line, the event name on the right.
// Names only, no explanations, so the day reads at a glance.

import type { WeddingContent } from "@/server/services/content";
import { formatTime } from "@/server/utils/dates";
import { ProgrammeTimeline } from "./ProgrammeTimeline";
import { Section } from "./Section";

export function Programme({ items }: { items: WeddingContent["programme"] }) {
  if (!items.length) return null;
  return (
    <Section id="programme" eyebrow="The day" title="Order of the day" intro="All times are East Africa Time (EAT).">
      <ProgrammeTimeline>
        {items.map((item, i) => (
          <li key={i} className="programme-item">
            <time dateTime={new Date(item.startsAt).toISOString()}>{formatTime(item.startsAt).replace(" EAT", "")}</time>
            <span className="programme-dot" aria-hidden="true" />
            <h3>{item.title}</h3>
          </li>
        ))}
      </ProgrammeTimeline>
    </Section>
  );
}
