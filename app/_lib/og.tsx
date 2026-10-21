import "server-only";

// Shared pieces for generated images (link preview, tab and home-screen icons): the same
// gold dove seal as the invitation, and the invitation's serif font when it can be fetched.

import { DoveSeal } from "@/components/envelope/DoveSeal";

/** The seal at a fixed pixel size, for ImageResponse. */
export const Seal = ({ size }: { size: number }) => <DoveSeal id="og-seal" size={size} />;

/**
 * A Google font as TrueType for ImageResponse (it can't read woff2), limited to the
 * letters in `text`. Google Fonts serves TrueType to clients that don't ask for woff2.
 * Null if it can't be fetched: the image then uses the built-in font rather than failing.
 */
export async function googleFont(family: string, axes: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${axes}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}
