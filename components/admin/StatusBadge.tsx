// Plain-language status labels (BLUEPRINT §5a) for the admin.

const LABEL: Record<string, [string, string]> = {
  draft: ["Not sent", "bg-wine/5 text-wine/70"],
  sent: ["Sent", "bg-[#e8eef8] text-[#28406b]"],
  viewed: ["Viewed", "bg-[#e4f1ec] text-[#1f5a45]"],
  awaiting_approval: ["Said Yes · approve?", "bg-gold/25 text-gold-deep"],
  declined: ["Declined", "bg-wine/10 text-wine"],
  approved: ["Approved", "bg-[#dff0e4] text-[#1d5c33]"],
  not_approved: ["Not approved", "bg-wine/10 text-wine/70"],
  partially_arrived: ["Arriving", "bg-[#dff0e4] text-[#1d5c33]"],
  arrived: ["Arrived", "bg-[#cfe9d7] text-[#174d2a]"],
  revoked: ["Revoked", "bg-[#f8e1e1] text-[#7a1d1d]"],
};

export const statusLabel = (s: string) => LABEL[s]?.[0] ?? s;

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = LABEL[status] ?? [status, "bg-wine/5"];
  return <span className={`label inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.55rem] ${cls}`}>{label}</span>;
}
