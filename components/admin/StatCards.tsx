// Dashboard overview cards (spec §8, BLUEPRINT D12 definitions).

import Link from "next/link";

type Card = { label: string; value: number; href?: string; tone?: "gold" | "alert" };

export function StatCards({ cards }: { cards: Card[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const inner = (
          <>
            <span className="label text-[0.6rem] text-wine/70">{c.label}</span>
            <span className={`mt-1 font-display text-4xl tabular-nums ${c.tone === "alert" && c.value > 0 ? "text-[#9b1c1c]" : "text-wine"}`}>{c.value}</span>
          </>
        );
        const cls = `flex flex-col rounded-sm border bg-white px-4 py-3 ${c.tone === "gold" ? "border-gold" : "border-wine/10"}`;
        return (
          <li key={c.label}>
            {c.href ? (
              <Link href={c.href} className={`${cls} transition-colors hover:border-gold-deep`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
