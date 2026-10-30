// FAQ accordion using native <details>: works without JavaScript and with screen readers.

import { Section } from "./Section";

export function Faq({ items }: { items: { question: string; answer: string }[] }) {
  if (!items.length) return null;
  return (
    <Section id="faq" eyebrow="Good to know" title="Questions & answers" layout="split">
      <div className="faq-list">
        {items.map((f, i) => (
          <details key={i} className="faq-item group">
            <summary>
              <span>{f.question}</span>
              <span className="faq-icon" aria-hidden />
            </summary>
            <p>{f.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
