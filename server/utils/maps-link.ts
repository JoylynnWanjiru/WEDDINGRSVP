// Turn a Google Maps link (or "lat, lng") into coordinates, so the couple can paste a pin
// instead of typing numbers. Short links (maps.app.goo.gl) are followed one redirect at a
// time, and only to Google hosts: the server never fetches an arbitrary URL (no SSRF).

const ALLOWED_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com"]);

export type Coords = { lat: number; lng: number };

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Coordinates written in text: "-1.13, 36.65", a /place/-1.13,36.65 path, @-1.13,36.65 or !3d-1.13!4d36.65. */
export function coordsFromText(text: string): Coords | null {
  const s = decodeURIComponent(text);
  const patterns = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /(?:place|search|dir)\/[^/]*?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/, /[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m && valid(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

export async function coordsFromMapsLink(input: string, fetchImpl: typeof fetch = fetch): Promise<Coords | null> {
  const direct = coordsFromText(input);
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return null;
    const fromUrl = coordsFromText(url.href);
    if (fromUrl) return fromUrl;
    const res = await fetchImpl(url.href, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const next = res.headers.get("location");
    if (!next) return null;
    url = new URL(next, url);
  }
  return null;
}
