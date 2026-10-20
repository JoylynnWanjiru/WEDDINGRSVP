// Dashboard (spec §8, U10): overview cards, approval queue, headcount vs capacity,
// dietary tallies for the caterer, email status. Always fresh: nothing here is cached.

import Link from "next/link";
import { Suspense } from "react";
import { ApprovalQueue } from "@/components/admin/ApprovalQueue";
import { StatCards } from "@/components/admin/StatCards";
import { getDb } from "@/server/db/client";
import { getApprovalQueue } from "@/server/services/admin/approvals";
import { getDashboard } from "@/server/services/admin/dashboard";
import { getEmailQuota } from "@/server/services/messaging";
import { getAdmin } from "../_lib/auth";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-wine/60">Loading the dashboard…</p>}>
      <Dashboard />
    </Suspense>
  );
}

const DIETARY_LABEL: Record<string, string> = {
  none: "No requirements",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  gluten_free: "Gluten-free",
  other: "Allergy / other",
};

async function Dashboard() {
  const ctx = await getAdmin();
  const db = getDb();
  const [d, queue, quota] = await Promise.all([getDashboard(db, ctx), getApprovalQueue(db, ctx), getEmailQuota(db, ctx)]);
  const h = d.headcount;
  const capacityPct = h.capacity ? Math.min(100, Math.round((h.approved / h.capacity) * 100)) : null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Dashboard</h1>
          <p className="text-sm text-wine/60">Live numbers from the guest list.</p>
        </div>
        <Link href="/admin/guests" className="label inline-flex min-h-11 items-center rounded-sm bg-wine px-5 text-[0.65rem] text-gold">
          Manage guests
        </Link>
      </header>

      {d.email.failed > 0 ? (
        <p role="alert" className="rounded-sm border border-[#9b1c1c]/30 bg-[#f8e1e1] px-4 py-3 text-[#7a1d1d]">
          {d.email.failed} email{d.email.failed === 1 ? "" : "s"} failed to send. Check the Gmail settings, then retry from the guest list (E10).
        </p>
      ) : null}

      <StatCards
        cards={[
          { label: "Invited", value: d.cards.invited, href: "/admin/guests" },
          { label: "Viewed", value: d.cards.viewed },
          { label: "Not yet viewed", value: d.cards.notYetViewed, href: "/admin/guests?filter=notViewed" },
          { label: "Awaiting approval", value: d.cards.awaitingApproval, tone: "gold" },
          { label: "Approved", value: d.cards.approved, href: "/admin/guests?status=approved" },
          { label: "Declined", value: d.cards.declined, href: "/admin/guests?status=declined" },
          { label: "No response", value: d.cards.noResponse, href: "/admin/guests?filter=noResponse" },
          { label: "Not approved", value: d.cards.notApproved },
          { label: "Requests", value: d.cards.requests },
          { label: "Revoked", value: d.cards.revoked },
        ]}
      />

      <section aria-labelledby="queue">
        <h2 id="queue" className="font-display text-3xl">
          Awaiting your approval <span className="text-gold-deep">({queue.queue.length})</span>
        </h2>
        <p className="mb-4 text-sm text-wine/60">Guests who said Yes. Nothing unlocks for them until you approve.</p>
        <ApprovalQueue
          rows={queue.queue.map((r) => ({ ...r, respondedAt: r.respondedAt?.toISOString() ?? null }))}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="headcount" className="rounded-sm border border-wine/10 bg-white p-5">
          <h2 id="headcount" className="font-display text-2xl">
            Headcount
          </h2>
          <p className="mt-2 font-display text-5xl tabular-nums">
            {h.approved}
            {h.capacity ? <span className="text-2xl text-wine/50"> / {h.capacity}</span> : null}
          </p>
          <p className="text-sm text-wine/60">
            approved people · {h.adults} adults, {h.children} children
          </p>
          {capacityPct !== null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-wine/10" aria-hidden>
              <div className={`h-full ${h.overCapacityBy > 0 ? "bg-[#9b1c1c]" : "bg-gold-deep"}`} style={{ width: `${capacityPct}%` }} />
            </div>
          ) : null}
          {h.overCapacityBy > 0 ? <p className="mt-2 text-sm text-[#9b1c1c]">{h.overCapacityBy} over the venue capacity.</p> : null}
          <p className="mt-4 text-sm">
            Arrived on the day: <span className="font-medium tabular-nums">{h.arrived}</span>
          </p>
        </section>

        <section aria-labelledby="dietary" className="rounded-sm border border-wine/10 bg-white p-5">
          <h2 id="dietary" className="font-display text-2xl">
            For the caterer
          </h2>
          <dl className="mt-3 space-y-1.5">
            {Object.entries(d.dietary).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <dt className="text-wine/70">{DIETARY_LABEL[k] ?? k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-wine/50">Approved guests only.</p>
        </section>

        <section aria-labelledby="email" className="rounded-sm border border-wine/10 bg-white p-5">
          <h2 id="email" className="font-display text-2xl">
            Email
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-wine/70">Sent today</dt>
              <dd className="tabular-nums">
                {quota.sentToday} / {quota.cap}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-wine/70">Waiting in the queue</dt>
              <dd className="tabular-nums">{quota.queued}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-wine/70">Sent in total</dt>
              <dd className="tabular-nums">{d.email.sent}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-wine/50">Daily cap {quota.cap} (BR-17), counted by Nairobi day.</p>
        </section>
      </div>
    </div>
  );
}
