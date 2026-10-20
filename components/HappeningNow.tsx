"use client";

// Day-of "happening now / next" banner (N2). Recomputes every 30 seconds in the browser,
// so a page left open on a phone stays current without reloading.

import { useSyncExternalStore } from "react";
import { happeningNow, type ProgrammeItem } from "@/lib/happening";

const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, 30_000);
  return () => clearInterval(timer);
};
const halfMinute = () => Math.floor(Date.now() / 30_000) * 30_000;

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "2-digit", hour12: true }).format(d);

export function HappeningNow({ programme, serverNow }: { programme: ProgrammeItem[]; serverNow: string }) {
  // On the server (and the first browser render) use the request time, so both match.
  const now = useSyncExternalStore(subscribe, halfMinute, () => Date.parse(serverNow));
  const { now: current, next } = happeningNow(programme, new Date(now));

  if (!current && !next) return null;
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2" aria-live="polite">
      {current ? (
        <div className="rounded-sm border border-gold bg-gold/15 px-5 py-4">
          <p className="label text-[0.65rem] text-gold">Happening now</p>
          <p className="mt-1 font-display text-2xl">{current.title}</p>
          {current.detail ? <p className="text-sm text-pearl">{current.detail}</p> : null}
        </div>
      ) : null}
      {next ? (
        <div className="rounded-sm border border-gold/30 bg-wine-night/40 px-5 py-4">
          <p className="label text-[0.65rem] text-pearl/70">Next · {time(next.startsAt)}</p>
          <p className="mt-1 font-display text-2xl">{next.title}</p>
          {next.venue ? <p className="text-sm text-pearl/80">{next.venue}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
