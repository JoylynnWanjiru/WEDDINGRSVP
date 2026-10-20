// Good to know: contributions / gifts (spec §4). Shown only if the couple adds details in settings.

import { Section } from "./Section";

export function GoodToKnow({ contributionInfo }: { contributionInfo: Record<string, string> | null }) {
  const entries = Object.entries(contributionInfo ?? {}).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <Section id="gifts" eyebrow="Good to know" title="Gifts & contributions">
      <dl className="mx-auto grid max-w-md gap-3">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-wine/15 pb-2">
            <dt className="text-wine/70">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
