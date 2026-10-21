"use client";

// CSV import (U1, D11): choose a file → preview what will be added and skipped → import.
// The file is read in the browser and sent as text; nothing is stored until "Import".

import Link from "next/link";
import { useState, useTransition } from "react";
import { importAction } from "@/app/admin/(dashboard)/guests/actions";
import type { ImportResult } from "@/server/services/admin/guests";
import { btn, Notice } from "./ui";

export function ImportForm() {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    setPreview(null);
    setDone(null);
    setError(null);
    if (!file) return;
    if (file.size > 1_000_000) return setError("That file is too large (max 1 MB).");
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    startTransition(async () => {
      const res = await importAction(text, true);
      if (res.ok) setPreview(res.data!);
      else setError(res.message);
    });
  }

  function confirmImport() {
    if (!csv) return;
    startTransition(async () => {
      const res = await importAction(csv, false);
      if (res.ok) {
        setDone(res.data!);
        setPreview(null);
      } else setError(res.message);
    });
  }

  return (
    <div className="space-y-5">
      <label className="block rounded-sm border-2 border-dashed border-wine/25 bg-white px-6 py-10 text-center hover:border-gold-deep">
        <span className="font-display text-2xl">Choose a CSV file</span>
        <span className="mt-1 block text-sm text-wine/70">{fileName || "Columns: full_name, phone, email, group, side, seat_allowance"}</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </label>
      <p className="text-sm text-wine/70">
        Start from the{" "}
        <a href="/templates/guest-list-template.csv" download className="text-gold-deep underline">
          template
        </a>
        . In Excel or Google Sheets, save as <em>CSV</em>. Phones can be 07…, 7… or 254….
      </p>

      {pending ? <Notice tone="info">Checking the file…</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {preview ? (
        <div className="space-y-4 rounded-sm border border-wine/10 bg-white p-5">
          <p className="font-display text-2xl">
            {preview.created} guest{preview.created === 1 ? "" : "s"} will be added
            {preview.skipped.length ? `, ${preview.skipped.length} skipped` : ""}
          </p>
          {preview.skipped.length ? <SkippedTable rows={preview.skipped} /> : null}
          <div className="flex gap-2">
            <button type="button" className={btn.primary} disabled={pending || preview.created === 0} onClick={confirmImport}>
              Import {preview.created} guest{preview.created === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      ) : null}

      {done ? (
        <div className="space-y-3">
          <Notice tone="ok">
            Imported {done.created} guest{done.created === 1 ? "" : "s"}.{" "}
            <Link href="/admin/guests" className="underline">
              Go to the guest list
            </Link>
          </Notice>
          {done.skipped.length ? <SkippedTable rows={done.skipped} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function SkippedTable({ rows }: { rows: ImportResult["skipped"] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-wine/70">
          <th className="py-1 pr-4 font-normal">Row</th>
          <th className="py-1 pr-4 font-normal">Name</th>
          <th className="py-1 font-normal">Why it was skipped</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-wine/10">
        {rows.map((r) => (
          <tr key={r.row}>
            <td className="py-1.5 pr-4 tabular-nums">{r.row}</td>
            <td className="py-1.5 pr-4">{r.fullName || "—"}</td>
            <td className="py-1.5 text-[#9b1c1c]">{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
