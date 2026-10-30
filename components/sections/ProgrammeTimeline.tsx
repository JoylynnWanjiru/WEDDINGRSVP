"use client";

// Scroll animation for the order of the day: a gold line fills down the timeline as the
// guest scrolls, and each stop lights up when the line reaches it. Without JavaScript, or
// with reduced motion, the list shows fully drawn (the CSS only hides stops under [data-anim]).

import { useEffect, useRef, type ReactNode } from "react";

export function ProgrammeTimeline({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stops = Array.from(list.querySelectorAll<HTMLElement>(".programme-item"));
    list.dataset.anim = "";

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = list.getBoundingClientRect();
      // The line's tip sits 60% down the screen.
      const reach = window.innerHeight * 0.6 - box.top;
      const progress = Math.min(1, Math.max(0, reach / box.height));
      list.style.setProperty("--progress", String(progress));
      for (const stop of stops) {
        if (stop.offsetTop + 12 <= reach) stop.dataset.on = "";
        else delete stop.dataset.on;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      delete list.dataset.anim;
    };
  }, []);

  return (
    <ol ref={ref} className="programme-list">
      {children}
    </ol>
  );
}
