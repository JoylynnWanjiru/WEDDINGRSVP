// FAQ accordion using native <details>: works without JavaScript and with screen readers.

import { Section } from "./Section";

export function Faq({ items }: { items: { question: string; answer: string }[] }) {
  if (!items.length) return null;
  return (
    <Section id="faq" eyebrow="Good to know" title="Questions & answers">
      <div className="mx-auto max-w-prose divide-y divide-wine/15 border-y border-wine/15">
        {items.map((f, i) => (
          <details key={i} className="group py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display text-xl">
              {f.question}
              <span className="text-gold-deep transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-2 leading-relaxed text-wine/80">{f.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
