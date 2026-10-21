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
      <ol className="programme-list">
        {items.map((item, i) => (
          <li key={i} className="programme-item">
            <time className="label" dateTime={new Date(item.startsAt).toISOString()}>{formatTime(item.startsAt).replace(" EAT", "")}</time>
            <div>
            <h3>{item.title}</h3>
            {item.detail ? <p className="text-sm text-wine/75">{item.detail}</p> : null}
            {manyVenues && item.venue ? <p className="text-xs text-wine/70">{item.venue}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="programme-timezone">All times are East Africa Time (EAT).</p>
    </Section>
  );
}
