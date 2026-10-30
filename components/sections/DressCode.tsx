"use client";

// Dress code with tap-to-copy colour swatches (spec §4, like the reference site).
// Swatches are arch-topped "fabric" chips, centred under the note.

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
      <p className="dress-text">{dressCode.text}</p>
      {dressCode.swatches.length ? (
        <>
          <ul className="swatches">
            {dressCode.swatches.map((s) => (
              <li key={s.hex}>
                <button type="button" onClick={() => copy(s.hex)} className="swatch" aria-label={`Copy ${s.name} colour code ${s.hex}`}>
                  <span className="swatch-chip" style={{ backgroundColor: s.hex }} />
                  <span className="swatch-name">{s.name}</span>
                  <span className="label swatch-hex">{copied === s.hex ? "Copied" : s.hex}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="swatch-hint" aria-live="polite">
            Tap a colour to copy its code.
          </p>
        </>
      ) : null}
    </Section>
  );
}
