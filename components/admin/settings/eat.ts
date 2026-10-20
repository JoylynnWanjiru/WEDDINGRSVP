// Date/time helpers for settings forms. Everything is entered and shown in Nairobi time (EAT,
// UTC+3, no daylight saving), whatever the admin's own computer is set to (E15).

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** ISO instant → { date: "2026-12-19", time: "13:00" } in EAT. */
export function toEat(iso: string | Date): { date: string; time: string } {
  const s = new Date(new Date(iso).getTime() + OFFSET_MS).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** "2026-12-19" + "13:00" (EAT) → ISO instant with the +03:00 offset. */
export const fromEat = (date: string, time: string) => `${date}T${time || "00:00"}:00+03:00`;
