"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { DoveSeal } from "./DoveSeal";

/** Accessible modal introduction; the underlying invitation still works without JS. */
export function Envelope({ children, addressedTo, monogram, onOpen }: {
  children: ReactNode;
  addressedTo: string;
  monogram?: string | null;
  onOpen?: () => void | Promise<unknown>;
}) {
  const [phase, setPhase] = useState<"sealed" | "opening" | "revealed">("sealed");
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);
  const id = useId();

  const finish = useCallback(() => {
    dialog.current?.close();
    setPhase("revealed");
    card.current?.focus({ preventScroll: true });
    if (!tracked.current) {
      tracked.current = true;
      // A failed tracking request must not prevent opening the invitation.
      void Promise.resolve().then(() => onOpen?.()).catch(() => {});
    }
  }, [onOpen]);

  useEffect(() => {
    if (phase === "sealed") dialog.current?.showModal();
  }, [phase]);
  useEffect(() => {
    if (phase !== "opening") return;
    const timer = setTimeout(finish, 2600);
    return () => clearTimeout(timer);
  }, [phase, finish]);
  useEffect(() => {
    if (phase === "revealed") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [phase]);

  function open() {
    if (phase !== "sealed") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else setPhase("opening");
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed" || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    tilt.current?.style.setProperty("--tilt-x", String(-((event.clientY - box.top) / box.height - .5) * 12) + "deg");
    tilt.current?.style.setProperty("--tilt-y", String(((event.clientX - box.left) / box.width - .5) * 16) + "deg");
  }

  return (
    <>
      <dialog ref={dialog} className="invitation-intro" aria-labelledby={id + "-title"} onCancel={(event) => { event.preventDefault(); finish(); }}>
        <div className="intro-content" data-phase={phase}>
          <div className="intro-halo" aria-hidden="true" />
          <p id={id + "-title"} className="label intro-eyebrow">A little envelope. A beautiful beginning.</p>
          <div className="intro-stage" onPointerMove={move} onPointerLeave={() => { tilt.current?.style.setProperty("--tilt-x", "0deg"); tilt.current?.style.setProperty("--tilt-y", "0deg"); }}>
            <div ref={tilt} className="intro-tilt">
              <div className="letter-envelope">
                <div className="letter-back" />
                <div className="letter-note" aria-hidden="true">
                  <span className="label">With love</span>
                  <span className="letter-monogram">{monogram || "Together"}</span>
                  <span className="letter-note-rule" />
                  <span className="label">You are warmly invited</span>
                </div>
                <div className="letter-pocket" />
                <div className="letter-flap" />
                <p className="letter-address">{addressedTo}</p>
                <button type="button" className="letter-seal" aria-label={addressedTo + ". Open your invitation"} disabled={phase !== "sealed"} onClick={open}>
                  <DoveSeal id={id + "-intro"} monogram={monogram} className="h-full w-full" />
                </button>
              </div>
            </div>
          </div>
          <div className="intro-caption">
            <p className="label" aria-live="polite">{phase === "opening" ? "Something beautiful awaits" : "Touch the seal to open"}</p>
            <button type="button" onClick={finish} className="intro-skip">Skip animation <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </dialog>
      <div className="invitation-hero">
        <div className="hero-arch" aria-hidden="true" />
        <div className="hero-seal" aria-hidden="true"><DoveSeal id={id + "-hero"} monogram={monogram} className="h-full w-full" /></div>
        <div ref={card} tabIndex={-1} className="invitation-card">{children}</div>
        <p className="hero-sentiment">A day to remember.<br /><em>A joy to share with you.</em></p>
        <div className="hero-actions">
          <a className="label hero-continue" href="#celebration">Discover the invitation <span aria-hidden="true">↓</span></a>
          <button type="button" className="hero-replay" onClick={() => setPhase("sealed")}><span aria-hidden="true">↻</span> Open again</button>
        </div>
      </div>
    </>
  );
}
