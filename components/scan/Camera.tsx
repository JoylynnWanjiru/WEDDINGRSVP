"use client";

// The usher's camera (spec §9: html5-qrcode). Loaded only on /scan. It keeps running
// and drops reads while `paused`, so moving between passes needs no camera restart.
// A QR is read again only after it has been out of view for REPEAT_MS: a guest still
// holding up their phone after "Scan next" doesn't bring the same result straight back.

import { useEffect, useId, useRef, useState } from "react";

const REPEAT_MS = 3000;

export function Camera({ paused, onScan }: { paused: boolean; onScan: (text: string) => void }) {
  const id = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const state = useRef({ paused, onScan, last: "", lastAt: 0 });
  useEffect(() => {
    state.current.paused = paused;
    state.current.onScan = onScan;
  });

  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const qr = new Html5Qrcode(`camera-${id}`, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          // Android Chrome's built-in reader works at full camera resolution; others use the library's own.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        });
        await qr.start(
          { facingMode: "environment" },
          // The pass QR is dense (a signed link): a large square and a square video give it the most pixels.
          { fps: 10, aspectRatio: 1, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.85), height: Math.floor(Math.min(w, h) * 0.85) }) },
          (text) => {
            const s = state.current;
            const now = Date.now();
            const seenJustNow = text === s.last && now - s.lastAt < REPEAT_MS;
            if (text === s.last) s.lastAt = now; // still in view, even while a result shows
            if (s.paused || seenJustNow) return;
            s.last = text;
            s.lastAt = now;
            s.onScan(text);
          },
          () => {}, // "no QR in this frame" fires constantly; not an error
        );
        stop = () => qr.stop().catch(() => {});
        if (cancelled) await stop();
      } catch (err) {
        const name = (err as { name?: string })?.name ?? String(err);
        setError(
          /NotAllowed|Permission/i.test(name)
            ? "Camera permission was refused. Allow the camera for this site in the browser settings, or find guests by name."
            : "The camera couldn't start. Close other apps using it and reload, or find guests by name.",
        );
      }
    })();
    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [id]);

  return (
    <div className="relative overflow-hidden rounded-sm bg-black">
      <div id={`camera-${id}`} className="w-full" />
      {error ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center bg-wine-night/95 p-6 text-center text-pearl">
          {error}
        </p>
      ) : null}
    </div>
  );
}
