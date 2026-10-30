// D28: a coarse device label for the open log, e.g. "iPhone" or "Windows computer".
// Enough for the couple to notice a link opened on two different devices (forwarded?),
// never enough to identify anyone: the user agent itself is not stored.

export function deviceFromUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "Unknown device";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  // iPadOS 13+ reports itself as a Mac; touch support can't be seen from the server, so it stays "Mac".
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux computer";
  if (/Mobi/i.test(ua)) return "Phone";
  return "Other device";
}
