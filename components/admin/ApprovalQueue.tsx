"use client";

// One-tap approve / not approve for every "Yes" (spec §8, U6). Approval is never automatic (A1).
// BR-11: going over capacity asks for a second confirmation instead of blocking.

import Link from "next/link";
import { useState, useTransition } from "react";
import { approveAction, declineAction } from "@/app/admin/(dashboard)/actions";
import { btn } from "./ui";

export type QueueRow = {
  id: string;
  fullName: string;
  group: string | null;
  partySize: number;
  seatAllowance: number;
  respondedAt: string | null;
  responseMessage: string | null;
};

export function ApprovalQueue({ rows }: { rows: QueueRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<{ ok: boolean; message?: string; needsConfirmation?: boolean }>) {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok && res.needsConfirmation && window.confirm(`${res.message}\n\nApprove anyway?`)) {
        const again = await approveAction(id, true);
        if (!again.ok) setError(again.message);
      } else if (!res.ok && !res.needsConfirmation) {
        setError(res.message ?? "Something went wrong.");
      }
      setBusy(null);
    });
  }

  if (!rows.length) return <p className="a-card px-4 py-8 text-center font-display text-xl italic text-wine/70">Nobody is waiting for approval.</p>;

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-sm bg-[#f8e1e1] px-4 py-3 text-sm text-[#7a1d1d]">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-wine/10 overflow-hidden a-card">
        {rows.map((r) => {
          const extras = r.partySize - 1;
          return (
            <li key={r.id} className="a-row flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/guests/${r.id}`} className="font-display text-xl hover:text-gold-deep">
                  {r.fullName}
                </Link>
                <p className="text-sm text-wine/70">
                  Party of {r.partySize}
                  {extras > 0 ? ` (${extras} of ${r.seatAllowance} extra seats used)` : ""}
                  {r.group ? ` · ${r.group}` : ""}
                </p>
                {r.responseMessage ? <p className="mt-1 text-sm italic text-wine/70">&ldquo;{r.responseMessage}&rdquo;</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(r.id, () => approveAction(r.id))}
                  className={btn.primary}
                >
                  {busy === r.id ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Not approve ${r.fullName}? They'll see a polite message and can't respond again unless you reopen it.`)) {
                      run(r.id, () => declineAction(r.id));
                    }
                  }}
                  className={btn.outline}
                >
                  Not approve
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
