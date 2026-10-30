// Good to know: contributions / gifts (spec §4). Shown only if the couple adds details in settings.

import { Section } from "./Section";

export function GoodToKnow({ contributionInfo }: { contributionInfo: Record<string, string> | null }) {
  const entries = Object.entries(contributionInfo ?? {}).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <Section id="gifts" eyebrow="Good to know" title="Gifts & contributions">
      <dl className="gift-card">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className="font-display">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
