// Dashboard (spec §8, U10): overview cards, approval queue, headcount vs capacity,
// dietary tallies for the caterer, email status. Always fresh: nothing here is cached.

import Link from "next/link";
import { Suspense } from "react";
import { ApprovalQueue } from "@/components/admin/ApprovalQueue";
import { StatCards } from "@/components/admin/StatCards";
import { btn } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getApprovalQueue } from "@/server/services/admin/approvals";
import { getDashboard } from "@/server/services/admin/dashboard";
import { listRecentOpens } from "@/server/services/admin/guests";
import { getSiteVisitStats } from "@/server/services/site-visits";
import { getEmailQuota } from "@/server/services/messaging";
import { getAdmin } from "../_lib/auth";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-wine/70">Loading the dashboard…</p>}>
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

const OPENED = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

async function Dashboard() {
  const ctx = await getAdmin();
  const db = getDb();
  const [d, queue, quota, opens, visits] = await Promise.all([
    getDashboard(db, ctx),
    getApprovalQueue(db, ctx),
    getEmailQuota(db, ctx),
    listRecentOpens(db, ctx),
    getSiteVisitStats(db, ctx),
  ]);
  const h = d.headcount;
  const capacityPct = h.capacity ? Math.min(100, Math.round((h.approved / h.capacity) * 100)) : null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="a-eyebrow">Overview</p>
          <h1 className="a-title mt-2">Dashboard</h1>
          <p className="text-sm text-wine/70">Live numbers from the guest list.</p>
        </div>
        <Link href="/admin/guests" className={btn.primary}>
          Manage guests
        </Link>
      </header>

      {d.email.failed > 0 ? (
        <p role="alert" className="a-notice bg-[#f8e1e1] text-[#7a1d1d]">
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

      {/* D29: the public page. Self-RSVPs are approved automatically; review them here. */}
      <section aria-labelledby="public-page">
        <h2 id="public-page" className="font-display text-3xl">
          Public page
        </h2>
        <p className="mb-4 text-sm text-wine/70">
          Devices that opened the public invitation (one per phone or computer, counted by a cookie), and the people who RSVPed there themselves.
        </p>
        <StatCards
          cards={[
            { label: "Self-RSVPs to review", value: visits.selfRsvps, href: "/admin/guests?filter=selfRsvp", tone: visits.selfRsvps ? "gold" : undefined },
            { label: "Devices", value: visits.devices },
            { label: "Visits", value: visits.visits },
            { label: "Devices that RSVPed", value: visits.rsvped },
          ]}
        />
        {visits.recent.length ? (
          <ul className="a-card mt-3 divide-y divide-wine/10 overflow-hidden">
            {visits.recent.map((v, i) => (
              <li key={i} className="a-row flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span>
                  {v.device}
                  {v.fullName && v.invitationId ? (
                    <>
                      {" · "}
                      <Link href={`/admin/guests/${v.invitationId}`} className="font-display text-lg hover:text-gold-deep">
                        {v.fullName}
                      </Link>
                    </>
                  ) : (
                    <span className="text-wine/70"> · hasn&rsquo;t RSVPed</span>
                  )}
                </span>
                <span className="text-wine/70">
                  {v.visits} visit{v.visits === 1 ? "" : "s"} · last <span className="tabular-nums">{OPENED.format(v.lastSeenAt)} EAT</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="queue">
        <h2 id="queue" className="font-display text-3xl">
          Awaiting your approval <span className="text-gold-deep">({queue.queue.length})</span>
        </h2>
        <p className="mb-4 text-sm text-wine/70">Guests who said Yes. Nothing unlocks for them until you approve.</p>
        <ApprovalQueue
          rows={queue.queue.map((r) => ({ ...r, respondedAt: r.respondedAt?.toISOString() ?? null }))}
        />
      </section>

      <section aria-labelledby="opened">
        <h2 id="opened" className="font-display text-3xl">
          Recently opened
        </h2>
        <p className="mb-4 text-sm text-wine/70">Guests who opened their personal link, newest first, however you sent it (D28).</p>
        {opens.length ? (
          <ul className="a-card divide-y divide-wine/10 overflow-hidden">
            {opens.map((o, i) => (
              <li key={i} className="a-row flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                <Link href={`/admin/guests/${o.invitationId}`} className="font-display text-xl hover:text-gold-deep">
                  {o.fullName}
                </Link>
                <span className="text-sm text-wine/70">
                  {o.device}
                  {o.taps > 1 ? ` · ${o.taps} taps` : ""} · <span className="tabular-nums">{OPENED.format(o.lastSeenAt)} EAT</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a-card px-4 py-8 text-center font-display text-xl italic text-wine/70">No one has opened their link yet.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="headcount" className="a-card p-5">
          <h2 id="headcount" className="font-display text-2xl">
            Headcount
          </h2>
          <p className="mt-2 font-display text-5xl tabular-nums">
            {h.approved}
            {h.capacity ? <span className="text-2xl text-wine/70"> / {h.capacity}</span> : null}
          </p>
          <p className="text-sm text-wine/70">
            approved people · {h.adults} adults, {h.children} children
          </p>
          {capacityPct !== null ? (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-wine/10" aria-hidden>
              <div className={`h-full rounded-full ${h.overCapacityBy > 0 ? "bg-[#9b1c1c]" : "bg-gradient-to-r from-gold-antique to-gold"}`} style={{ width: `${capacityPct}%` }} />
            </div>
          ) : null}
          {h.overCapacityBy > 0 ? <p className="mt-2 text-sm text-[#9b1c1c]">{h.overCapacityBy} over the venue capacity.</p> : null}
          <p className="mt-4 text-sm">
            Arrived on the day: <span className="font-medium tabular-nums">{h.arrived}</span>
          </p>
          {d.vendors.teams ? (
            <p className="mt-1 text-sm text-wine/70">
              Plus {d.vendors.staff} vendor staff in {d.vendors.teams} team{d.vendors.teams === 1 ? "" : "s"} ({d.vendors.arrived} arrived), not counted above.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="dietary" className="a-card p-5">
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
          <p className="mt-3 text-xs text-wine/70">Approved guests only.</p>
          {/* D25: vendors are fed too, but counted on their own line. */}
          <p className="mt-4 flex justify-between border-t border-wine/10 pt-3 text-sm">
            <Link href="/admin/vendors" className="underline underline-offset-4">
              Vendor meals
            </Link>
            <span className="tabular-nums">{d.vendors.meals}</span>
          </p>
        </section>

        <section aria-labelledby="email" className="a-card p-5">
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
          <p className="mt-3 text-xs text-wine/70">Daily cap {quota.cap} (BR-17), counted by Nairobi day.</p>
        </section>
      </div>
    </div>
  );
}
