// D28: the coarse device label kept in the open log.

import { describe, expect, it } from "vitest";
import { deviceFromUserAgent } from "@/server/utils/device";

describe("deviceFromUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "iPhone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPad"],
    ["Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36", "Android phone"],
    ["Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Android tablet"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Windows computer"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "Mac"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Chromebook"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Linux computer"],
    ["SomeBot/1.0", "Other device"],
  ])("%s → %s", (ua, label) => {
    expect(deviceFromUserAgent(ua)).toBe(label);
  });

  it("no user agent is an unknown device", () => {
    expect(deviceFromUserAgent(null)).toBe("Unknown device");
    expect(deviceFromUserAgent("  ")).toBe("Unknown device");
  });
});
