"use client";

// Per-guest actions: share the link (copy, WhatsApp, email), status decisions, and fixes
// (new link, mark bounced). Destructive or guest-visible actions ask before running.

import { useState, useTransition } from "react";
import { approveAction, declineAction } from "@/app/admin/(dashboard)/actions";
import {
  markBouncedAction,
  markWhatsappSharedAction,
  queueEmailsAction,
  reopenAction,
  restoreAction,
  revokeAction,
  rotateLinkAction,
  sendNowAction,
} from "@/app/admin/(dashboard)/guests/actions";
import { correctArrivalsAction } from "@/app/admin/(dashboard)/tools/actions";
import { btn, Notice, TextInput } from "./ui";

type Props = {
  id: string;
  fullName: string;
  status: string;
  link: string;
  whatsappUrl: string | null;
  email: string | null;
  emailBounced: boolean;
  partySize: number;
  arrivedCount: number;
};

export function GuestActions({ id, fullName, status, link, whatsappUrl, email, emailBounced, partySize, arrivedCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; needsConfirmation?: boolean }>, done?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) setNotice(done ? { tone: "ok", text: done } : null);
      else if (res.needsConfirmation && window.confirm(`${res.message}\n\nApprove anyway?`)) {
        const again = await approveAction(id, true);
        setNotice(again.ok ? { tone: "ok", text: "Approved." } : { tone: "error", text: again.message });
      } else setNotice({ tone: "error", text: res.message ?? "Something went wrong." });
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  function emailNow() {
    startTransition(async () => {
      const q = await queueEmailsAction([id]);
      if (!q.ok) return setNotice({ tone: "error", text: q.message });
      if (!q.data!.queued) return setNotice({ tone: "info", text: q.data!.skipped[0]?.reason ?? "Not queued." });
      const s = await sendNowAction();
      if (!s.ok) return setNotice({ tone: "error", text: s.message });
      setNotice(
        s.data!.authFailed
          ? { tone: "error", text: "Gmail refused the login. Check the Gmail settings in .env.local." }
          : s.data!.sent
            ? { tone: "ok", text: `Invitation emailed to ${email}.` }
            : { tone: "info", text: "Queued; it will go out with the next send (daily limit may be reached)." },
      );
    });
  }

  function correct(form: FormData) {
    const arrived = Number(form.get("arrived"));
    const reason = String(form.get("reason") ?? "");
    run(() => correctArrivalsAction(id, arrived, reason), `Corrected: ${arrived} of ${partySize} arrived.`);
  }

  const canSend = status !== "revoked";

  return (
    <div className="space-y-5">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <section aria-label="Share the invitation">
        <p className="label mb-2 text-[0.6rem] text-wine/70">Share the personal link</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.outline} onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </button>
          {whatsappUrl && canSend ? (
            <button
              type="button"
              className={btn.primary}
              disabled={pending}
              onClick={() => {
                window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                run(() => markWhatsappSharedAction(id), "Marked as shared on WhatsApp.");
              }}
            >
              Send on WhatsApp
            </button>
          ) : null}
          {email && canSend && !emailBounced ? (
            <button type="button" className={btn.primary} disabled={pending} onClick={emailNow}>
              Email invitation
            </button>
          ) : null}
          {/* E27: opening the link while signed in as admin is not counted as the guest viewing it. */}
          <a href={link} target="_blank" rel="noopener noreferrer" className={btn.outline}>
            Open as guest
          </a>
        </div>
      </section>

      <section aria-label="Decisions">
        <p className="label mb-2 text-[0.6rem] text-wine/70">Decisions</p>
        <div className="flex flex-wrap gap-2">
          {status === "awaiting_approval" ? (
            <>
              <button type="button" className={btn.primary} disabled={pending} onClick={() => run(() => approveAction(id), "Approved.")}>
                Approve
              </button>
              <button
                type="button"
                className={btn.outline}
                disabled={pending}
                onClick={() => window.confirm(`Not approve ${fullName}?`) && run(() => declineAction(id), "Marked not approved.")}
              >
                Not approve
              </button>
            </>
          ) : null}
          {status === "not_approved" ? (
            <button type="button" className={btn.outline} disabled={pending} onClick={() => run(() => reopenAction(id), "Reopened: back to awaiting approval.")}>
              Reopen
            </button>
          ) : null}
          {status === "revoked" ? (
            <button type="button" className={btn.primary} disabled={pending} onClick={() => run(() => restoreAction(id), "Restored.")}>
              Restore invitation
            </button>
          ) : status !== "arrived" ? (
            <button
              type="button"
              className={btn.danger}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Revoke ${fullName}'s invitation? Their link and gate pass stop working immediately.`)) return;
                const notify = !!email && window.confirm("Also email them a polite notice? (Cancel = revoke silently)");
                run(() => revokeAction(id, notify), "Revoked.");
              }}
            >
              Revoke invitation
            </button>
          ) : null}
        </div>
      </section>

      <section aria-label="Fixes">
        <p className="label mb-2 text-[0.6rem] text-wine/70">Fixes</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn.outline}
            disabled={pending}
            onClick={() =>
              window.confirm("Issue a new personal link? The old link stops working at once, so send them the new one.") &&
              run(() => rotateLinkAction(id), "New link issued. Copy or send it again.")
            }
          >
            New link
          </button>
          {email && !emailBounced ? (
            <button
              type="button"
              className={btn.outline}
              disabled={pending}
              onClick={() => window.confirm(`Mark ${email} as bounced? No more emails go there until it's changed.`) && run(() => markBouncedAction(id), "Marked as bounced.")}
            >
              Mark email bounced
            </button>
          ) : null}
        </div>
      </section>

      {/* D20, §7: fix a mis-tapped count at the gate. The original check-ins stay in the log. */}
      {status === "partially_arrived" || status === "arrived" ? (
        <section aria-label="Correct arrivals">
          <p className="label mb-2 text-[0.6rem] text-wine/70">Correct arrivals</p>
          <form action={correct} className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              Arrived
              <span className="w-20">
                <TextInput name="arrived" type="number" min={0} max={partySize} defaultValue={arrivedCount} required />
              </span>
              <span className="text-wine/70">of {partySize}</span>
            </label>
            <span className="min-w-56 flex-1">
              <TextInput name="reason" aria-label="Reason" placeholder="Reason, e.g. usher tapped 3 instead of 2" required maxLength={300} />
            </span>
            <button type="submit" className={btn.outline} disabled={pending}>
              Save correction
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
