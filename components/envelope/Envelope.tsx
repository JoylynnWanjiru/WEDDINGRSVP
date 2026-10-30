"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type RefObject } from "react";
import { DoveSeal } from "./DoveSeal";

// The envelope is split in two so it can open without waiting for the database:
// <EnvelopeIntro> sits in the static shell and is sent with the first bytes of HTML,
// while <EnvelopeHero> (the card behind it) streams in with the guest's data. They share
// state through <EnvelopeProvider>, which wraps both sides of the page's Suspense boundary.

type Phase = "sealed" | "opening" | "revealed";

type EnvelopeState = {
  phase: Phase;
  /** True once the guest has opened (or skipped) the envelope themselves. */
  openedByGuest: boolean;
  open: () => void;
  finish: () => void;
  /** Close without counting it as the guest opening it (e.g. a revoked link). */
  dismiss: () => void;
  replay: () => void;
  card: RefObject<HTMLDivElement | null>;
};

const Ctx = createContext<EnvelopeState | null>(null);

function useEnvelope() {
  const state = useContext(Ctx);
  if (!state) throw new Error("Envelope parts must be inside <EnvelopeProvider>");
  return state;
}

const noop = () => () => {};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Holds the open/closed state. `intro` stays interactive; `children` is inert while sealed. */
export function EnvelopeProvider({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("sealed");
  const [openedByGuest, setOpenedByGuest] = useState(false);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const card = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    setPhase("revealed");
    setOpenedByGuest(true);
    card.current?.focus({ preventScroll: true });
  }, []);
  const dismiss = useCallback(() => setPhase("revealed"), []);
  const open = useCallback(() => {
    if (phase !== "sealed") return;
    if (reducedMotion()) finish();
    else setPhase("opening");
  }, [phase, finish]);
  const replay = useCallback(() => setPhase("sealed"), []);

  useEffect(() => {
    if (phase !== "opening") return;
    const timer = setTimeout(finish, 1700); // matches intro-depart in guest.css
    return () => clearTimeout(timer);
  }, [phase, finish]);
  useEffect(() => {
    if (phase === "revealed") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The intro is a non-modal dialog (it is open in the server HTML), so Escape is ours to handle.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [phase, finish]);

  return (
    <Ctx.Provider value={{ phase, openedByGuest, open, finish, dismiss, replay, card }}>
      {intro}
      {/* Inert only once JavaScript runs: without it the intro is hidden and the page must work. */}
      <div className="contents" inert={hydrated && phase !== "revealed"}>{children}</div>
    </Ctx.Provider>
  );
}

/**
 * The sealed envelope overlay. Rendered open on the server, so its animation starts as soon
 * as the HTML arrives. `address` and `monogram` may be streamed slots (<Suspense>).
 */
export function EnvelopeIntro({ address, monogram }: { address: ReactNode; monogram: ReactNode }) {
  const { phase, open, finish } = useEnvelope();
  const tilt = useRef<HTMLDivElement>(null);
  const seal = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (phase === "sealed") seal.current?.focus({ preventScroll: true });
  }, [phase]);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "sealed" || event.pointerType !== "mouse" || reducedMotion()) return;
    const box = event.currentTarget.getBoundingClientRect();
    tilt.current?.style.setProperty("--tilt-x", String(-((event.clientY - box.top) / box.height - .5) * 12) + "deg");
    tilt.current?.style.setProperty("--tilt-y", String(((event.clientX - box.left) / box.width - .5) * 16) + "deg");
  }

  return (
    <dialog open={phase !== "revealed"} className="invitation-intro" aria-modal="true" aria-labelledby={id + "-title"}>
      {/* No JavaScript: nobody could close the overlay, so show the invitation directly. */}
      <noscript><style>{".invitation-intro{display:none}"}</style></noscript>
      <div className="intro-content" data-phase={phase}>
        <div className="intro-halo" aria-hidden="true" />
        <p id={id + "-title"} className="label intro-eyebrow">A little envelope. A beautiful beginning.</p>
        <div className="intro-stage" onPointerMove={move} onPointerLeave={() => { tilt.current?.style.setProperty("--tilt-x", "0deg"); tilt.current?.style.setProperty("--tilt-y", "0deg"); }}>
          <div ref={tilt} className="intro-tilt">
            <div className="letter-envelope">
              <div className="letter-back" />
              <div className="letter-note" aria-hidden="true">
                <span className="label">With love</span>
                <span className="letter-monogram">{monogram}</span>
                <span className="letter-note-rule" />
                <span className="label">You are warmly invited</span>
              </div>
              <div className="letter-pocket" />
              <div className="letter-flap" />
              <p id={id + "-address"} className="letter-address">{address}</p>
              <button ref={seal} type="button" className="letter-seal" aria-labelledby={`${id}-address ${id}-action`} disabled={phase !== "sealed"} onClick={open}>
                <DoveSeal id={id + "-intro"} className="h-full w-full" />
                {/* HTML, not SVG text, so the monogram can stream in after the seal is drawn. */}
                <span className="letter-seal-monogram" aria-hidden="true">{monogram}</span>
                <span id={id + "-action"} className="sr-only">Open your invitation</span>
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
  );
}

/** The card shown once the envelope opens. Streams in with the page data. */
export function EnvelopeHero({ children, monogram }: { children: ReactNode; monogram?: string | null }) {
  const { replay, card } = useEnvelope();
  const id = useId();
  return (
    <div className="invitation-hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-arch" aria-hidden="true" />
      <div className="hero-seal" aria-hidden="true"><DoveSeal id={id + "-hero"} monogram={monogram} className="h-full w-full" /></div>
      <div ref={card} tabIndex={-1} className="invitation-card">{children}</div>
      <div className="hero-actions">
        <a className="label hero-continue" href="#celebration">
          <span>Discover the invitation</span>
          <span className="hero-cue" aria-hidden="true" />
        </a>
        <button type="button" className="label hero-replay" onClick={replay}><span aria-hidden="true">↻</span> Open the envelope again</button>
      </div>
    </div>
  );
}

/**
 * U3 proof of receipt: runs `onOpen` the first time the guest opens the envelope. It lives in
 * the streamed part because it needs the token; if the guest opened before it arrived, it
 * still fires on mount.
 */
export function TrackOpen({ onOpen }: { onOpen: () => void | Promise<unknown> }) {
  const { openedByGuest } = useEnvelope();
  const sent = useRef(false);
  useEffect(() => {
    if (!openedByGuest || sent.current) return;
    sent.current = true;
    // A failed tracking request must not prevent opening the invitation.
    void Promise.resolve().then(() => onOpen()).catch(() => {});
  }, [openedByGuest, onOpen]);
  return null;
}

/** For pages with nothing to open (revoked link, coming soon): put the envelope away. */
export function DismissEnvelope() {
  const { dismiss } = useEnvelope();
  useEffect(() => dismiss(), [dismiss]);
  return null;
}
