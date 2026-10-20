"use client";

// Friendly error page (BLUEPRINT §10: "if unreachable, show 'Please try again in a moment',
// never a page with missing locks"). E16: the free database may take a second to wake up.

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-4xl text-gold">Please try again in a moment</h1>
      <p className="max-w-sm text-pearl/80">Something didn&rsquo;t load. This usually fixes itself within a few seconds.</p>
      <button type="button" onClick={reset} className="label mt-4 min-h-11 rounded-sm bg-gold px-6 py-3 text-wine">
        Try again
      </button>
    </main>
  );
}
