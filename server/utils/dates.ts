// Africa/Nairobi date helpers (E15: everything is shown in EAT). Nairobi is UTC+3
// all year with no daylight saving, so day boundaries are a fixed offset.
// v2 (other couples, other time zones) should use weddings.timezone instead.

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
export const TIMEZONE = "Africa/Nairobi";

/** The calendar date in Nairobi, as YYYY-MM-DD. */
export function nairobiDate(at: Date): string {
  return new Date(at.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight in Nairobi at the start of `at`'s Nairobi day, as an instant. */
export function nairobiDayStart(at: Date): Date {
  return new Date(Date.parse(`${nairobiDate(at)}T00:00:00Z`) - EAT_OFFSET_MS);
}

/** YYYY-MM-DD plus or minus whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/** "Saturday, 12 December 2026" */
export const formatDate = (at: Date | string) =>
  new Intl.DateTimeFormat("en-KE", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    typeof at === "string" ? new Date(`${at}T12:00:00+03:00`) : at,
  );

/** "1:00 pm EAT" (12-hour, as on the invitation; en-KE defaults to 24-hour) */
export const formatTime = (at: Date) =>
  `${new Intl.DateTimeFormat("en-KE", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(at)} EAT`;

/** "Saturday, 14 November 2026, 11:59 pm EAT" */
export const formatDateTime = (at: Date) => `${formatDate(at)}, ${formatTime(at)}`;
