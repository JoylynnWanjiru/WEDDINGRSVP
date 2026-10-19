// CSV import parsing and export formatting (RFC 4180: quotes, commas, newlines in fields).

/** Parses CSV text into rows of cells. Handles quoted fields, "" escapes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parses CSV with a header row into objects keyed by lower-cased, trimmed header names. */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [header = [], ...body] = parseCsv(text);
  const headers = header.map((h) => h.trim().toLowerCase());
  const records = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
  return { headers, records };
}

/**
 * Formula injection guard: a cell starting with = + - @ (or tab/CR) can run as a
 * formula in Excel. Such cells get a leading apostrophe. Phone numbers like
 * +254… are digits after the +, so they are left alone.
 */
function safeCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=\-@\t\r]/.test(s) || /^\+(?!\d+$)/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]): string {
  const lines = [columns.map((c) => safeCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => safeCell(c.value(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}
