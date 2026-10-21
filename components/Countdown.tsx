"use client";

// Countdown to the ceremony (spec §4). Runs in the browser only: the server renders
// a placeholder, so the page never shows a stale number from the moment it was built.

import { useSyncExternalStore } from "react";

// The clock as an "external store": ticks every second in the browser, null on the server.
const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};
const nowSecond = () => Math.floor(Date.now() / 1000) * 1000; // stable within a second
const onServer = () => null;

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function partsUntil(target: number, now: number): Parts | null {
  const ms = target - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export function Countdown({ target }: { target: string }) {
  const t = Date.parse(target);
  const now = useSyncExternalStore<number | null>(subscribe, nowSecond, onServer);
  const parts = now === null ? null : partsUntil(t, now);

  if (now !== null && !parts) {
    return <p className="font-display text-2xl italic text-gold">Today we celebrate</p>;
  }

  const cells: [string, number | undefined][] = [
    ["Days", parts?.days],
    ["Hours", parts?.hours],
    ["Minutes", parts?.minutes],
    ["Seconds", parts?.seconds],
  ];

  return (
    <div className="guest-countdown" role="timer" aria-label={parts ? `${parts.days} days to go` : "Countdown"}>
      {cells.map(([label, value]) => (
        <div key={label}>
          <span className="countdown-number" aria-hidden>
            {value === undefined ? "–" : String(value).padStart(2, "0")}
          </span>
          <span className="label mt-1 text-[0.6rem] text-gold">{label}</span>
        </div>
      ))}
    </div>
  );
}
