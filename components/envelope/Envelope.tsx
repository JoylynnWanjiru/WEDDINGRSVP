"use client";

// Envelope opening (spec §4): tap the gold dove seal, the flap lifts and the card
// slides out. CSS transitions only (globals.css), so no animation library is shipped,
// and "reduce motion" on the phone turns the movement off.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DoveSeal } from "./DoveSeal";

export function Envelope({
  children,
  addressedTo,
  monogram,
  onOpen,
}: {
  /** The card's content, shown once the envelope opens. */
  children: ReactNode;
  /** Printed on the envelope, e.g. "For our dear guest" or "For Wanjiru". */
  addressedTo: string;
  monogram?: string | null;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) cardRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Extra room above, so the card has space to rise out of the envelope. */}
      <div className="envelope mt-[38%] sm:mt-40" data-open={open}>
        <div className="envelope__back" />
        <div
          ref={cardRef}
          className="envelope__card flex flex-col items-center justify-center px-6 text-center outline-none"
          tabIndex={-1}
          aria-hidden={!open}
        >
          {children}
        </div>
        <div className="envelope__front" />
        <div className="envelope__flap" />
        <p className="label absolute inset-x-0 bottom-[9%] z-[4] text-center text-pearl/90" aria-hidden={open}>
          {addressedTo}
        </p>
        <button
          type="button"
          className="envelope__seal"
          onClick={() => {
            setOpen(true);
            onOpen?.();
          }}
          aria-label={`${addressedTo}. Tap the seal to open your invitation`}
        >
          <DoveSeal id="envelope-seal" monogram={monogram} className="h-full w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
        </button>
      </div>

      <p className="label min-h-5 text-pearl/70" aria-live="polite">
        {open ? (
          <button type="button" className="underline decoration-gold/60 underline-offset-4 hover:text-gold" onClick={() => setOpen(false)}>
            Open again
          </button>
        ) : (
          "Tap the seal"
        )}
      </p>
    </div>
  );
}
