"use client";

// Tools page forms: usher PIN and sign-out (D20, E26), and the guest-data purge (D13).

import { useState, useTransition } from "react";
import { changePinAction, purgeAction, signOutUshersAction } from "@/app/admin/(dashboard)/tools/actions";
import { adminInput, btn, Field, Notice, TextInput } from "./ui";

type Note = { tone: "ok" | "error"; text: string } | null;

export function UsherControls({ pinSet }: { pinSet: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Note>(null);
  const [formKey, setFormKey] = useState(0);

  function savePin(form: FormData) {
    const pin = String(form.get("pin") ?? "").trim();
    if (pin !== String(form.get("confirm") ?? "").trim()) return setNotice({ tone: "error", text: "The two PINs don't match." });
    if (pinSet && !window.confirm("Change the PIN? Every usher is signed out and must log in again with the new PIN.")) return;
    startTransition(async () => {
      const res = await changePinAction(pin);
      setNotice(res.ok ? { tone: "ok", text: "PIN saved. Share it with the ushers in person or by phone, not in a group chat." } : { tone: "error", text: res.message });
      if (res.ok) setFormKey((k) => k + 1);
    });
  }

  function signOut() {
    if (!window.confirm("Sign out every usher now? They log in again with the same PIN.")) return;
    startTransition(async () => {
      const res = await signOutUshersAction();
      setNotice(res.ok ? { tone: "ok", text: "All ushers signed out." } : { tone: "error", text: res.message });
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-wine/70">
        {pinSet ? "A PIN is set. Ushers enter it at /scan to open the scanner." : "No PIN yet: the scanner can't be used until you set one."}
      </p>
      <form key={formKey} action={savePin} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={pinSet ? "New PIN" : "PIN"} hint="4 to 8 digits">
          <TextInput name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" required />
        </Field>
        <Field label="Type it again">
          <TextInput name="confirm" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" required />
        </Field>
        <button type="submit" className={btn.primary} disabled={pending}>
          {pinSet ? "Change PIN" : "Set PIN"}
        </button>
      </form>
      {pinSet ? (
        <div>
          <button type="button" className={btn.danger} disabled={pending} onClick={signOut}>
            Sign out all ushers
          </button>
          <p className="mt-1 text-sm text-wine/70">Use this if an usher&rsquo;s phone is lost. If the PIN itself has leaked, change it instead.</p>
        </div>
      ) : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    </div>
  );
}

export function PurgeForm({ phrase, invitations, requests }: { phrase: string; invitations: number; requests: number }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Note>(null);
  const [typed, setTyped] = useState("");

  function purge() {
    if (!window.confirm("This cannot be undone. Have you downloaded the exports you need?")) return;
    startTransition(async () => {
      const res = await purgeAction(typed);
      if (!res.ok) return setNotice({ tone: "error", text: res.message });
      setTyped("");
      setNotice({ tone: "ok", text: `Deleted ${res.data!.invitations} invitations and ${res.data!.requests} requests.` });
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-wine/70">
        Deletes every guest&rsquo;s personal data: {invitations} invitations, {requests} requests, their RSVPs, check-ins, queued emails and the activity log.
        The wedding details, programme, venue and FAQ stay. Every link and gate pass stops working.
      </p>
      <Field label={`Type ${phrase} to confirm`}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={adminInput} />
      </Field>
      <button type="button" className={btn.danger} disabled={pending || typed.trim() !== phrase} onClick={purge}>
        {pending ? "Deleting…" : "Delete all guest data"}
      </button>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    </div>
  );
}
