"use client";

// Dress code with tap-to-copy colour swatches (spec §4, like the reference site).

import { useState } from "react";
import { Section } from "./Section";

export function DressCode({ dressCode }: { dressCode: { text: string; swatches: { name: string; hex: string }[] } | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!dressCode) return null;

  async function copy(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1500);
    } catch {
      // Clipboard blocked (e.g. old browser): the hex code is visible anyway.
    }
  }

  return (
    <Section id="dress-code" eyebrow="What to wear" title="Dress code">
      <p className="mx-auto max-w-prose text-center text-lg">{dressCode.text}</p>
      {dressCode.swatches.length ? (
        <>
          <ul className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-5">
            {dressCode.swatches.map((s) => (
              <li key={s.hex}>
                <button type="button" onClick={() => copy(s.hex)} className="group flex w-full flex-col items-center gap-2" aria-label={`Copy ${s.name} colour code ${s.hex}`}>
                  <span className="h-14 w-14 rounded-full border border-wine/15 shadow-inner transition-transform group-hover:scale-105" style={{ backgroundColor: s.hex }} />
                  <span className="text-sm">{s.name}</span>
                  <span className="label text-[0.6rem] text-gold-deep">{copied === s.hex ? "Copied" : s.hex}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-xs text-wine/70" aria-live="polite">
            Tap a colour to copy its code.
          </p>
        </>
      ) : null}
    </Section>
  );
}
