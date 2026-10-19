import { describe, expect, it } from "vitest";
import { addDays, formatDate, formatDateTime, formatTime, nairobiDate, nairobiDayStart } from "@/server/utils/dates";

describe("E15: Africa/Nairobi dates", () => {
  it("the Nairobi date changes at 21:00 UTC", () => {
    expect(nairobiDate(new Date("2026-10-20T20:59:59Z"))).toBe("2026-10-20");
    expect(nairobiDate(new Date("2026-10-20T21:00:00Z"))).toBe("2026-10-21");
    expect(nairobiDayStart(new Date("2026-10-21T02:00:00Z")).toISOString()).toBe("2026-10-20T21:00:00.000Z");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-12", -1)).toBe("2026-12-11");
    expect(addDays("2026-12-12", 30)).toBe("2027-01-11");
  });

  it("formats in EAT for guests anywhere (E15)", () => {
    const ceremony = new Date("2026-12-12T13:00:00+03:00");
    expect(formatDate("2026-12-12")).toBe("Saturday, 12 December 2026");
    expect(formatTime(ceremony)).toMatch(/^1:00\s?pm EAT$/i);
    expect(formatDateTime(new Date("2026-11-14T23:59:59+03:00"))).toMatch(/^Saturday, 14 November 2026, 11:59\s?pm EAT$/i);
  });
});
