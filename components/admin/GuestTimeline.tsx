// What happened to this invitation, newest first (U3: sent → viewed → responded → arrived).

const ACTION: Record<string, string> = {
  added: "Added to the list",
  imported: "Imported",
  edited: "Details edited",
  send: "Sent",
  viewed: "Opened the invitation",
  rsvp_yes: "Answered Yes",
  rsvp_no: "Answered No",
  approve: "Approved",
  decline_attendance: "Not approved",
  reopen: "Reopened",
  revoke: "Revoked",
  restore: "Restored",
  link_rotated: "New link issued",
  email_bounced: "Email marked bounced",
  admit: "Checked in at the gate",
  correct_arrivals: "Arrivals corrected",
  request_accepted: "Created from a request",
  request_linked_existing: "Matched a request",
};

const BY: Record<string, string> = { admin: "the couple", guest: "the guest", usher: "an usher", system: "automatically", public: "the public form" };

type Entry = { at: Date; actor: string; actorLabel: string | null; action: string; meta: Record<string, unknown> | null };

export function GuestTimeline({ entries }: { entries: Entry[] }) {
  if (!entries.length) return <p className="text-sm text-wine/60">Nothing yet.</p>;
  const fmt = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <ol className="space-y-2">
      {entries.map((e, i) => {
        const channel = typeof e.meta?.channel === "string" ? ` by ${e.meta.channel}` : "";
        const by = e.actor === "usher" && e.actorLabel ? e.actorLabel : BY[e.actor];
        return (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-32 shrink-0 tabular-nums text-wine/50">{fmt.format(e.at)}</span>
            <span>
              {ACTION[e.action] ?? e.action}
              {channel}
              <span className="text-wine/50"> · {by}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
