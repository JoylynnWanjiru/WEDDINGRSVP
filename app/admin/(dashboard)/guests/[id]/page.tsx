// One guest (spec §8): details, sharing, decisions, party, events, timeline.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GuestActions } from "@/components/admin/GuestActions";
import { GuestEditForm } from "@/components/admin/GuestEditForm";
import { GuestTimeline } from "@/components/admin/GuestTimeline";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { getInvitationDetail } from "@/server/services/admin/guests";
import { devicesForInvitation } from "@/server/services/site-visits";
import { getAdmin } from "../../../_lib/auth";

export default function GuestPage({ params }: PageProps<"/admin/guests/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/admin/guests" className="label inline-flex min-h-11 items-center text-[0.6rem] text-gold-deep underline underline-offset-4">
        ← All guests
      </Link>
      <Suspense fallback={<p className="text-wine/70">Loading guest…</p>}>
        <Guest params={params} />
      </Suspense>
    </div>
  );
}

const DIETARY: Record<string, string> = { none: "", vegetarian: "Vegetarian", vegan: "Vegan", halal: "Halal", gluten_free: "Gluten-free", other: "Other" };
const EVENT: Record<string, string> = { ceremony: "Ceremony", reception: "Reception", traditional: "Traditional ceremony" };

async function Guest({ params }: { params: PageProps<"/admin/guests/[id]">["params"] }) {
  const { id } = await params;
  const ctx = await getAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound(); // a malformed id would be a database error, not "not found"
  let g: Awaited<ReturnType<typeof getInvitationDetail>>;
  let devices: Awaited<ReturnType<typeof devicesForInvitation>>;
  try {
    g = await getInvitationDetail(getDb(), ctx, id);
    devices = await devicesForInvitation(getDb(), ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const fmt = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(d) : "—";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <header>
          <p className="a-eyebrow">{g.source === "public" ? "Self-RSVP · public page" : "Guest"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="a-title">{g.fullName}</h1>
            <StatusBadge status={g.status} />
          </div>
          {g.source === "public" ? (
            <p className="mt-2 max-w-2xl text-sm text-wine/70">
              This person RSVPed on the public page themselves (D29). Check they belong on the list; revoking cancels their gate pass.
            </p>
          ) : null}
        </header>

        <section className="a-card p-5">
          <GuestActions
            id={g.id}
            fullName={g.fullName}
            status={g.status}
            link={g.link}
            whatsappUrl={g.whatsapp?.url ?? null}
            email={g.email}
            emailBounced={!!g.emailBouncedAt}
            partySize={g.partySize}
            arrivedCount={g.arrivedCount}
          />
        </section>

        <section className="a-card p-5" aria-labelledby="party">
          <h2 id="party" className="font-display text-2xl">
            Party of {g.partySize}
            {g.arrivedCount ? <span className="text-base text-wine/70"> · {g.arrivedCount} arrived</span> : null}
          </h2>
          {g.party.length ? (
            <ul className="mt-3 divide-y divide-wine/10">
              {g.party.map((m, i) => (
                <li key={i} className="flex justify-between gap-4 py-2 text-sm">
                  <span>
                    {m.fullName}
                    {m.isPrimary ? <span className="text-wine/70"> (invitee)</span> : null}
                    {m.isChild ? <span className="text-wine/70"> (child)</span> : null}
                  </span>
                  <span className="text-wine/70">{[DIETARY[m.dietary], m.dietaryNotes].filter(Boolean).join(": ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-wine/70">They haven&rsquo;t answered yet.</p>
          )}
          {g.events.length > 1 ? (
            <p className="mt-3 text-sm text-wine/70">
              Attending: {g.events.filter((e) => e.attending).map((e) => EVENT[e.event] ?? e.event).join(", ") || "none"}
            </p>
          ) : null}
          {g.responseMessage ? <p className="mt-3 text-sm italic text-wine/70">&ldquo;{g.responseMessage}&rdquo;</p> : null}
        </section>

        <section className="a-card p-5" aria-labelledby="edit">
          <h2 id="edit" className="mb-4 font-display text-2xl">
            Details
          </h2>
          <GuestEditForm
            guest={{
              id: g.id,
              fullName: g.fullName,
              phone: g.phone,
              email: g.email,
              group: g.group,
              side: g.side,
              seatAllowance: g.seatAllowance,
              notes: g.notes,
              updatedAt: g.updatedAt.toISOString(),
            }}
          />
        </section>
      </div>

      <aside className="space-y-6">
        <section className="a-card p-5" aria-labelledby="delivery">
          <h2 id="delivery" className="font-display text-2xl">
            Delivery
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {[
              ["WhatsApp shared", fmt(g.whatsappSharedAt)],
              ["Link copied", fmt(g.linkCopiedAt)],
              ["Email sent", fmt(g.emailSentAt)],
              ["Email opened (hint only)", fmt(g.emailOpenedAt)],
              ["First viewed", fmt(g.firstViewedAt)],
              ["Last viewed", fmt(g.lastViewedAt)],
              ["Opens", g.opens.length ? String(g.opens.length) : String(g.viewCount)],
              ["Responded", fmt(g.respondedAt)],
              ["Approved", fmt(g.approvedAt)],
              ["Pass emailed", fmt(g.passEmailedAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-wine/70">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {g.emailBouncedAt ? <p className="mt-3 text-sm text-[#9b1c1c]">Email bounced. Change the address to send again.</p> : null}
        </section>

        <section className="a-card p-5" aria-labelledby="opens">
          <h2 id="opens" className="font-display text-2xl">
            Opens
          </h2>
          <p className="mt-1 text-xs text-wine/70">Each time the guest opened their link. Taps on the same device within 30 minutes count as one visit (D28).</p>
          {new Set(g.opens.map((o) => o.device)).size > 1 ? (
            <p className="mt-3 rounded-sm bg-gold/15 px-3 py-2 text-sm">
              Opened on {new Set(g.opens.map((o) => o.device)).size} different devices. The link may have been forwarded, or the guest uses more than one device.
            </p>
          ) : null}
          {g.opens.length ? (
            <ol className="mt-3 divide-y divide-wine/10 text-sm">
              {g.opens.map((o, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                  <span>
                    {o.device}
                    {o.taps > 1 ? <span className="text-wine/70"> · {o.taps} taps</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-wine/70">{fmt(o.openedAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-wine/70">
              {g.firstViewedAt ? "Opened before the open log started: see First and Last viewed above." : "Not opened yet."}
            </p>
          )}
        </section>

        {devices.length ? (
          <section className="a-card p-5" aria-labelledby="devices">
            <h2 id="devices" className="font-display text-2xl">
              Devices on the public page
            </h2>
            <p className="mt-1 text-xs text-wine/70">The device this guest RSVPed from, and its visits to the public page (D29).</p>
            <ol className="mt-3 divide-y divide-wine/10 text-sm">
              {devices.map((d, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                  <span>
                    {d.device}
                    <span className="text-wine/70"> · {d.visits} visit{d.visits === 1 ? "" : "s"}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-wine/70">{fmt(d.lastSeenAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="a-card p-5" aria-labelledby="timeline">
          <h2 id="timeline" className="mb-3 font-display text-2xl">
            Timeline
          </h2>
          <GuestTimeline entries={g.timeline} />
        </section>
      </aside>
    </div>
  );
}
