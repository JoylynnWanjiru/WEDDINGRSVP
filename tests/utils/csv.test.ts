import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "@/server/utils/csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, escaped quotes, CRLF, a BOM and blank lines", () => {
    const text = '﻿name,note\r\n"Kamau, Wanjiru","said ""hi""\nthen left"\r\n\r\nPlain,x\n';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Kamau, Wanjiru", 'said "hi"\nthen left'],
      ["Plain", "x"],
    ]);
  });

  it("maps records by lower-cased headers and fills missing cells", () => {
    const { headers, records } = parseCsvRecords("Full_Name , Phone\nA B,0700000000\nC D\n");
    expect(headers).toEqual(["full_name", "phone"]);
    expect(records).toEqual([
      { full_name: "A B", phone: "0700000000" },
      { full_name: "C D", phone: "" },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes where needed and guards against formula injection, but leaves +254 phones alone", () => {
    const csv = toCsv(
      [{ a: '=HYPERLINK("http://evil")', b: "+254700000000", c: "@SUM(A1)", d: 'x,"y"', e: "-1+1" }],
      ["a", "b", "c", "d", "e"].map((k) => ({ header: k, value: (r: Record<string, string>) => r[k] })),
    );
    const [, row] = csv.trim().split("\r\n");
    expect(row).toBe(`"'=HYPERLINK(""http://evil"")",+254700000000,'@SUM(A1),"x,""y""",'-1+1`);
  });

  it("round-trips through parseCsv", () => {
    const rows = [{ n: "Kamau, Wanjiru", m: 'a "quote"\nnewline' }];
    const csv = toCsv(rows, [
      { header: "n", value: (r) => r.n },
      { header: "m", value: (r) => r.m },
    ]);
    expect(parseCsv(csv)).toEqual([["n", "m"], ["Kamau, Wanjiru", 'a "quote"\nnewline']]);
  });
});
