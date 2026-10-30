// Dashboard overview cards (spec §8, BLUEPRINT D12 definitions).

import Link from "next/link";

type Card = { label: string; value: number; href?: string; tone?: "gold" | "alert" };

export function StatCards({ cards }: { cards: Card[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const tone = c.tone === "alert" && c.value === 0 ? undefined : c.tone;
        const inner = (
          <>
            <span className="a-stat-label">{c.label}</span>
            <span className="a-stat-value">{c.value}</span>
            {c.href ? <span className="a-stat-arrow" aria-hidden>↗</span> : null}
          </>
        );
        return (
          <li key={c.label}>
            {c.href ? (
              <Link href={c.href} className="a-card a-stat" data-tone={tone}>
                {inner}
              </Link>
            ) : (
              <div className="a-card a-stat" data-tone={tone}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
