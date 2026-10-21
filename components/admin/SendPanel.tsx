"use client";

// "Send now" (BLUEPRINT D7): drains the email queue in batches, calling the server again
// while emails remain, until the queue is empty, the daily cap is reached, or Gmail refuses.

import { useState, useTransition } from "react";
import { retryFailedAction, sendNowAction } from "@/app/admin/(dashboard)/guests/actions";
import { btn, Notice } from "./ui";

export function SendPanel({ queued, failed, sentToday, cap }: { queued: number; failed: number; sentToday: number; cap: number }) {
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  function sendAll() {
    setMessage(null);
    startTransition(async () => {
      let sent = 0;
      let failedNow = 0;
      for (let round = 0; round < 20; round++) {
        setProgress(`Sending… ${sent} sent so far`);
        const res = await sendNowAction();
        if (!res.ok) {
          setMessage({ tone: "error", text: res.message });
          break;
        }
        const s = res.data!;
        sent += s.sent;
        failedNow += s.failed;
        if (s.authFailed) {
          setMessage({ tone: "error", text: "Gmail refused the login. Check GMAIL_USER and GMAIL_APP_PASSWORD, then use Retry failed." });
          break;
        }
        if (s.capReached) {
          setMessage({ tone: "info", text: `${sent} sent. Today's limit is reached; the rest will go tomorrow (or press Send now again tomorrow).` });
          break;
        }
        if (s.remaining === 0 || s.sent + s.failed + s.cancelled + s.retrying === 0) {
          setMessage({ tone: failedNow ? "error" : "ok", text: `${sent} sent${failedNow ? `, ${failedNow} failed` : ""}.` });
          break;
        }
      }
      setProgress(null);
    });
  }

  return (
    <div className="rounded-sm border border-wine/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm">
          <span className="font-display text-2xl tabular-nums">{queued}</span> waiting to send
        </p>
        <p className="text-sm text-wine/70">
          Sent today {sentToday} / {cap}
        </p>
        {failed > 0 ? <p className="text-sm text-[#9b1c1c]">{failed} failed</p> : null}
        <div className="ml-auto flex gap-2">
          {failed > 0 ? (
            <button type="button" className={btn.outline} disabled={pending} onClick={() => startTransition(async () => void (await retryFailedAction()))}>
              Retry failed
            </button>
          ) : null}
          <button type="button" className={btn.primary} disabled={pending || queued === 0} onClick={sendAll}>
            {pending ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>
      {progress ? <p className="mt-2 text-sm text-wine/70">{progress}</p> : null}
      {message ? (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
    </div>
  );
}
