// Tools (spec §8 Exports, D20 gate controls, D13 data deletion).

import { Suspense, type ReactNode } from "react";
import { PurgeForm, UsherControls } from "@/components/admin/Tools";
import { getDb } from "@/server/db/client";
import { getGateStatus } from "@/server/services/admin/gate";
import { PURGE_CONFIRMATION } from "@/server/services/purge";
import { getAdmin } from "../../_lib/auth";

export const metadata = { title: "Tools" };

const EXPORTS = [
  { kind: "guests", title: "Guest list", detail: "Everyone invited, with status, contacts and party size." },
  { kind: "dietary", title: "Dietary list", detail: "For the caterer: approved guests only, adults and children." },
  { kind: "headcount", title: "Headcount by group", detail: "Invitations and approved people per group." },
  { kind: "checkins", title: "Check-in report", detail: "Who arrived on the day, and when." },
  { kind: "vendors", title: "Vendor list", detail: "Vendor teams with contacts, staff, meals and arrival times (D25)." },
];

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="a-eyebrow">Exports & utilities</p>
        <h1 className="a-title mt-2">Tools</h1>
        <p className="text-sm text-wine/70">Downloads, the gate scanner, and deleting guest data after the wedding.</p>
      </header>
      <Suspense fallback={<p className="text-wine/70">Loading…</p>}>
        <Tools />
      </Suspense>
    </div>
  );
}

function Card({ id, title, children, tone }: { id: string; title: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section aria-labelledby={id} className={`a-card p-5 ${tone === "danger" ? "border-[#9b1c1c]/30" : "border-wine/10"}`}>
      <h2 id={id} className="mb-4 font-display text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Tools() {
  const ctx = await getAdmin();
  const s = await getGateStatus(getDb(), ctx);
  const autoPurge = new Date(`${s.autoPurgeOn}T12:00:00+03:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });

  return (
    <>
      <Card id="exports" title="Download lists">
        <p className="mb-4 text-sm text-wine/70">CSV files open in Excel or Google Sheets. They contain personal data: keep them private and delete copies after the wedding.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPORTS.map((e) => (
            <li key={e.kind}>
              {/* A plain link: the browser downloads the file (the route checks the admin session). */}
              <a href={`/api/export/${e.kind}`} download className="flex min-h-11 flex-col rounded-sm border border-wine/15 px-4 py-3 hover:border-gold-deep">
                <span className="font-medium">{e.title} ↓</span>
                <span className="text-sm text-wine/70">{e.detail}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card id="ushers" title="Gate scanner (ushers)">
        <UsherControls pinSet={s.pinSet} />
      </Card>

      <Card id="purge" title="Delete guest data" tone="danger">
        {s.purgedAt ? (
          <p className="text-sm text-wine/70">Guest data was deleted on {s.purgedAt.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi" })}.</p>
        ) : (
          <>
            {/* BR-23 */}
            <p className="mb-4 text-sm text-wine/70">
              This happens automatically on <strong>{autoPurge}</strong>, {s.purgeAfterDays} days after the wedding, as Kenya&rsquo;s data protection law expects. Use the button only to delete earlier.
            </p>
            <PurgeForm phrase={PURGE_CONFIRMATION} invitations={s.invitations} requests={s.requests} />
          </>
        )}
      </Card>
    </>
  );
}
