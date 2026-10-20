import { describe, expect, it } from "vitest";
import { coordsFromMapsLink, coordsFromText } from "@/server/utils/maps-link";

const PIN = "https://www.google.com/maps/place/-1.292066,36.821946/data=!4m6!3m5!1s0!7e2!8m2!3d-1.2920659!4d36.8219462!18m1!1e1";

describe("coordsFromText", () => {
  it.each([
    ["-1.2920659, 36.8219462", { lat: -1.2920659, lng: 36.8219462 }],
    [PIN, { lat: -1.2920659, lng: 36.8219462 }], // precise !3d/!4d beats the rounded /place/ path
    ["https://www.google.com/maps/@-1.2921,36.8219,15z", { lat: -1.2921, lng: 36.8219 }],
    ["https://www.google.com/maps/dir/?api=1&destination=-1.2921,36.8219", { lat: -1.2921, lng: 36.8219 }],
  ])("%s", (input, expected) => {
    expect(coordsFromText(input)).toEqual(expected);
  });

  it("rejects text without valid coordinates", () => {
    expect(coordsFromText("Example Gardens")).toBeNull();
    expect(coordsFromText("95.0, 36.6")).toBeNull();
  });
});

describe("coordsFromMapsLink", () => {
  const fakeFetch = (location: string | null) =>
    (async () => new Response(null, { status: 302, headers: location ? { location } : {} })) as unknown as typeof fetch;

  it("follows a maps.app.goo.gl short link to the pin", async () => {
    expect(await coordsFromMapsLink("https://maps.app.goo.gl/abc123example", fakeFetch(PIN))).toEqual({ lat: -1.2920659, lng: 36.8219462 });
  });

  it("never fetches non-Google hosts or plain http (no SSRF)", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response(null);
    }) as unknown as typeof fetch;
    expect(await coordsFromMapsLink("https://evil.example/maps", spy)).toBeNull();
    expect(await coordsFromMapsLink("http://maps.app.goo.gl/abc", spy)).toBeNull();
    expect(await coordsFromMapsLink("http://169.254.169.254/latest/meta-data", spy)).toBeNull();
    expect(called).toBe(false);
  });

  it("stops if a Google redirect points somewhere else", async () => {
    expect(await coordsFromMapsLink("https://maps.app.goo.gl/x", fakeFetch("https://evil.example/-1.1,36.6"))).toBeNull();
  });

  it("a place link with no coordinates returns null (paste the pin link instead)", async () => {
    expect(await coordsFromMapsLink("https://maps.app.goo.gl/y", fakeFetch("https://www.google.com/maps/place/Example+Gardens/data=!4m2!3m1!1s0x182f"))).toBeNull();
  });
});
