// Order of the day (spec §5), times in EAT for guests anywhere (E15).
// A hairline timeline beside the heading: compact rows so a long day stays easy to scan.

import type { WeddingContent } from "@/server/services/content";
import { formatTime } from "@/server/utils/dates";
import { Section } from "./Section";

export function Programme({ items }: { items: WeddingContent["programme"] }) {
  if (!items.length) return null;
  // Name the venue on each item only when the day moves between venues.
  const manyVenues = new Set(items.map((i) => i.venue).filter(Boolean)).size > 1;
  return (
    <Section id="programme" eyebrow="The day" title="Order of the day" layout="split" intro="All times are East Africa Time (EAT).">
      <ol className="programme-list">
        {items.map((item, i) => (
          <li key={i} className="programme-item">
            <time className="label" dateTime={new Date(item.startsAt).toISOString()}>{formatTime(item.startsAt).replace(" EAT", "")}</time>
            <div>
              <h3>{item.title}</h3>
              {item.detail ? <p>{item.detail}</p> : null}
              {manyVenues && item.venue ? <p className="label programme-venue">{item.venue}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
