"use client";

// Guest list (spec §8): per-row Copy link and WhatsApp, and email to selected guests.
// WhatsApp opens the couple's own WhatsApp with the personal message ready (free, §10);
// tapping it records that the link went out.

import Link from "next/link";
import { useState, useTransition } from "react";
import { markWhatsappSharedAction, queueEmailsAction } from "@/app/admin/(dashboard)/guests/actions";
import { StatusBadge } from "./StatusBadge";
import { btn, Notice } from "./ui";

export type GuestRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  group: string | null;
  status: string;
  partySize: number;
  seatAllowance: number;
  emailSentAt: string | null;
  whatsappSharedAt: string | null;
  firstViewedAt: string | null;
  emailBouncedAt: string | null;
  link: string;
  whatsappUrl: string | null;
};

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(iso)) : null;

export function GuestTable({ rows }: { rows: GuestRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = rows.length > 0 && selected.size === rows.length;

  async function copy(row: GuestRow) {
    try {
      await navigator.clipboard.writeText(row.link);
      setCopied(row.id);
      setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 1500);
    } catch {
      window.prompt("Copy this link:", row.link);
    }
  }

  function whatsapp(row: GuestRow) {
    window.open(row.whatsappUrl!, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const res = await markWhatsappSharedAction(row.id);
      if (!res.ok) setNotice({ tone: "error", text: res.message });
    });
  }

  function emailSelected() {
    startTransition(async () => {
      const res = await queueEmailsAction([...selected]);
      if (!res.ok) return setNotice({ tone: "error", text: res.message });
      const { queued, skipped } = res.data!;
      setSelected(new Set());
      setNotice({
        tone: queued ? "ok" : "info",
        text: `${queued} invitation email${queued === 1 ? "" : "s"} queued. Press "Send now" above to send.${skipped.length ? ` Skipped ${skipped.length}: ${[...new Set(skipped.map((s) => s.reason))].join(" ")}` : ""}`,
      });
    });
  }

  if (!rows.length) return <p className="rounded-sm border border-wine/10 bg-white px-4 py-8 text-center text-wine/70">No guests match.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} className="accent-[#3D0F19]" />
          Select all ({rows.length})
        </label>
        <button type="button" className={btn.primary} disabled={!selected.size || pending} onClick={emailSelected}>
          Email invitation to {selected.size || "selected"}
        </button>
      </div>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <ul className="divide-y divide-wine/10 overflow-hidden rounded-sm border border-wine/10 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <label className="-my-1 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-[#3D0F19]" aria-label={`Select ${r.fullName}`} />
              </label>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/guests/${r.id}`} className="inline-flex min-h-11 min-w-11 items-center font-display text-xl hover:text-gold-deep">
                    {r.fullName}
                  </Link>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-wine/70">
                  {[
                    r.group,
                    `party ${r.partySize}${r.seatAllowance ? ` (up to ${r.seatAllowance + 1})` : ""}`,
                    r.whatsappSharedAt ? `WhatsApp ${when(r.whatsappSharedAt)}` : null,
                    r.emailSentAt ? `email ${when(r.emailSentAt)}` : null,
                    r.firstViewedAt ? `viewed ${when(r.firstViewedAt)}` : null,
                    r.emailBouncedAt ? "email bounced" : null,
                    !r.phone && !r.email ? "no phone or email" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">
              <button type="button" className={btn.outline} onClick={() => copy(r)}>
                {copied === r.id ? "Copied" : "Copy link"}
              </button>
              {r.whatsappUrl ? (
                <button type="button" className={btn.outline} onClick={() => whatsapp(r)} disabled={pending}>
                  WhatsApp
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
