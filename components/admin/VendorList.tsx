"use client";

// The vendor teams (D25): share the link (copy, WhatsApp), edit, new link, remove / restore.
// Removing or a new link stops the old pass at once, so both ask first.

import { useState, useTransition } from "react";
import { newVendorLinkAction, removeVendorAction, restoreVendorAction } from "@/app/admin/(dashboard)/vendors/actions";
import { toEat } from "./settings/eat";
import { btn, Notice } from "./ui";
import { VendorForm, type VendorRow } from "./VendorForm";

export function VendorList({ vendors, weddingDate }: { vendors: VendorRow[]; weddingDate: string }) {
  if (!vendors.length) return <p className="text-wine/70">No vendors yet. Add the first one above.</p>;
  return (
    <ul className="space-y-4">
      {vendors.map((v) => (
        <li key={v.id}>
          <VendorCard vendor={v} weddingDate={weddingDate} />
        </li>
      ))}
    </ul>
  );
}

function arrival(iso: string | null, weddingDate: string) {
  if (!iso) return "Arrival time not set";
  const { date, time } = toEat(iso);
  const day = date === weddingDate ? "on the day" : new Date(`${date}T12:00:00+03:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
  return `Arrives ${time} EAT ${day}`;
}

function VendorCard({ vendor: v, weddingDate }: { vendor: VendorRow; weddingDate: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? { tone: "ok", text: done } : { tone: "error", text: res.message ?? "Something went wrong." });
    });

  async function copy() {
    if (!v.link) return;
    try {
      await navigator.clipboard.writeText(v.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", v.link);
    }
  }

  if (editing) {
    return (
      <section aria-label={`Edit ${v.company}`} className="rounded-sm border border-gold-deep/40 bg-white p-5">
        <h2 className="mb-4 font-display text-2xl">Edit {v.company}</h2>
        <VendorForm vendor={v} weddingDate={weddingDate} onDone={() => setEditing(false)} />
      </section>
    );
  }

  return (
    <article className={`rounded-sm border bg-white p-5 ${v.removed ? "border-wine/10 opacity-70" : "border-wine/15"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label text-[0.6rem] text-gold-deep">{v.role}</p>
          <h2 className="font-display text-2xl">
            {v.company}
            {v.removed ? <span className="label ml-3 rounded-sm bg-wine/10 px-2 py-1 align-middle text-[0.55rem] text-wine">Removed</span> : null}
          </h2>
          <p className="text-sm text-wine/70">
            {[v.contactName, v.phone, v.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
        </div>
        <dl className="flex gap-5 text-center text-sm">
          <div>
            <dt className="text-wine/70">Staff</dt>
            <dd className="font-display text-2xl tabular-nums">{v.staffCount}</dd>
          </div>
          <div>
            <dt className="text-wine/70">Meals</dt>
            <dd className="font-display text-2xl tabular-nums">{v.mealCount}</dd>
          </div>
          <div>
            <dt className="text-wine/70">Arrived</dt>
            <dd className="font-display text-2xl tabular-nums">{v.arrivedCount}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 text-sm">{arrival(v.arriveAt, weddingDate)}</p>
      {v.instructions ? <p className="mt-1 text-sm text-wine/80">For them: {v.instructions}</p> : null}
      {v.notes ? <p className="mt-1 text-sm text-wine/70">Private: {v.notes}</p> : null}

      {notice ? (
        <div className="mt-3">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {v.removed ? (
          <button type="button" className={btn.outline} disabled={pending} onClick={() => run(() => restoreVendorAction(v.id), `${v.company} restored. Their link works again.`)}>
            Restore
          </button>
        ) : (
          <>
            <button type="button" className={btn.outline} onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            {v.whatsappUrl ? (
              <a href={v.whatsappUrl} target="_blank" rel="noopener noreferrer" className={btn.primary}>
                Send on WhatsApp
              </a>
            ) : null}
            {v.link ? (
              <a href={v.link} target="_blank" rel="noopener noreferrer" className={btn.outline}>
                Open their page
              </a>
            ) : null}
            <button type="button" className={btn.outline} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className={btn.outline}
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Make a new link for ${v.company}? Their old link and gate pass stop working; send them the new one.`)) {
                  run(() => newVendorLinkAction(v.id), "New link made. Send it to them: the old link and pass no longer work.");
                }
              }}
            >
              New link
            </button>
            <button
              type="button"
              className={btn.danger}
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Remove ${v.company}? Their link and gate pass stop working at once. You can restore them later.`)) {
                  run(() => removeVendorAction(v.id), `${v.company} removed.`);
                }
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </article>
  );
}
