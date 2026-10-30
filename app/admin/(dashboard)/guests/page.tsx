// Guest list (spec §8): search, filters, add guest, per-row link/WhatsApp, bulk email, Send now.

import Link from "next/link";
import { Suspense } from "react";
import { AddGuestForm } from "@/components/admin/AddGuestForm";
import { GuestTable } from "@/components/admin/GuestTable";
import { SendPanel } from "@/components/admin/SendPanel";
import { statusLabel } from "@/components/admin/StatusBadge";
import { adminInput, btn } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { INVITATION_STATUSES, type InvitationStatus } from "@/server/domain/status";
import { loadWedding } from "@/server/services/admin/context";
import { getDashboard } from "@/server/services/admin/dashboard";
import { listGroups, listInvitations } from "@/server/services/admin/guests";
import { getEmailQuota } from "@/server/services/messaging";
import { getAdmin } from "../../_lib/auth";

export default function GuestsPage({ searchParams }: PageProps<"/admin/guests">) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="a-eyebrow">Guest list</p>
          <h1 className="a-title mt-2">Guests</h1>
          <p className="text-sm text-wine/70">One row per invitation (household).</p>
        </div>
        <Link href="/admin/guests/import" className={btn.outline}>
          Import from CSV
        </Link>
      </header>
      <Suspense fallback={<p className="text-wine/70">Loading guests…</p>}>
        <Guests searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Guests({ searchParams }: { searchParams: PageProps<"/admin/guests">["searchParams"] }) {
  const sp = await searchParams;
  const q = one(sp.q);
  const status = one(sp.status);
  const group = one(sp.group);
  const filter = one(sp.filter);

  const ctx = await getAdmin();
  const db = getDb();
  const validStatus = (INVITATION_STATUSES as readonly string[]).includes(status) ? (status as InvitationStatus) : undefined;
  const [rows, groups, wedding, quota, dashboard] = await Promise.all([
    listInvitations(db, ctx, {
      search: q || undefined,
      status: validStatus,
      group: group || undefined,
      notViewed: filter === "notViewed",
      noResponse: filter === "noResponse",
      selfRsvp: filter === "selfRsvp",
    }),
    listGroups(db, ctx),
    loadWedding(db, ctx),
    getEmailQuota(db, ctx),
    getDashboard(db, ctx),
  ]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  return (
    <>
      <SendPanel queued={quota.queued} failed={dashboard.email.failed} sentToday={quota.sentToday} cap={quota.cap} />

      <details className="a-card">
        <summary className="label flex min-h-12 cursor-pointer items-center px-5 py-4 text-[0.62rem] text-gold-deep">+ Add a guest</summary>
        <div className="border-t border-wine/10 p-4">
          <AddGuestForm defaultSeatAllowance={wedding.defaultSeatAllowance} />
        </div>
      </details>

      {/* A plain GET form: filters live in the URL, so they survive reloads and can be bookmarked. */}
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Search name, email or phone" className={adminInput} aria-label="Search" />
        <select name="status" defaultValue={status} className={adminInput} aria-label="Status">
          <option value="">Any status</option>
          {INVITATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select name="group" defaultValue={group} className={adminInput} aria-label="Group">
          <option value="">Any group</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select name="filter" defaultValue={filter} className={adminInput} aria-label="Show">
          <option value="">Everyone</option>
          <option value="notViewed">Sent, not yet viewed</option>
          <option value="noResponse">No response yet</option>
          <option value="selfRsvp">Self-RSVPs (public page)</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className={btn.primary}>
            Filter
          </button>
          {q || status || group || filter ? (
            <Link href="/admin/guests" className={btn.outline}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <GuestTable
        rows={rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          phone: r.phone,
          email: r.email,
          group: r.group,
          status: r.status,
          selfRsvp: r.source === "public",
          partySize: r.partySize,
          seatAllowance: r.seatAllowance,
          emailSentAt: iso(r.emailSentAt),
          whatsappSharedAt: iso(r.whatsappSharedAt),
          linkCopiedAt: iso(r.linkCopiedAt),
          firstViewedAt: iso(r.firstViewedAt),
          lastViewedAt: iso(r.lastViewedAt),
          openCount: r.openCount,
          openDevices: r.openDevices,
          emailBouncedAt: iso(r.emailBouncedAt),
          link: r.link,
          whatsappUrl: r.whatsappUrl,
        }))}
      />
    </>
  );
}
