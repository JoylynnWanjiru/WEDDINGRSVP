"use client";

// Who can sign in (D26): add a person, reset a lost phone, remove someone. Adding or
// resetting shows a one-time setup link to send them; removing signs them out at once.

import { useState, useTransition } from "react";
import { addAdminAction, removeAdminAction, resetAdminAction } from "@/app/admin/(dashboard)/settings/actions";
import type { AdminRow } from "@/server/services/admin/admins";
import { btn, Field, Notice, TextInput } from "../ui";

export function AdminsEditor({ admins }: { admins: AdminRow[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", email: "" });

  function add() {
    startTransition(async () => {
      const res = await addAdminAction(form);
      if (!res.ok) {
        setFields(res.fields ?? {});
        setNotice({ tone: "error", text: res.message });
        return;
      }
      setLink({ name: form.name, url: res.data!.setupLink });
      setNotice(null);
      setFields({});
      setForm({ name: "", email: "" });
    });
  }

  function reset(a: AdminRow) {
    if (!confirm(`Reset ${a.name}'s authenticator? They are signed out and need the new setup link to sign in again.`)) return;
    startTransition(async () => {
      const res = await resetAdminAction(a.id);
      if (res.ok) {
        setLink({ name: a.name, url: res.data!.setupLink });
        setNotice(null);
      } else setNotice({ tone: "error", text: res.message });
    });
  }

  function remove(a: AdminRow) {
    if (!confirm(`Remove ${a.name}? They are signed out at once and can't sign in again.`)) return;
    startTransition(async () => {
      const res = await removeAdminAction(a.id);
      setLink(null);
      setNotice(res.ok ? { tone: "ok", text: `${a.name} can no longer sign in.` } : { tone: "error", text: res.message });
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-wine/70">
        Everyone signs in with their own email, the admin password and a code from an authenticator app on their phone. Only people listed
        here can sign in.
      </p>

      <ul className="divide-y divide-wine/10 rounded-sm border border-wine/10">
        {admins.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">
                {a.name}
                {a.isYou ? <span className="ml-2 text-sm text-wine/70">(you)</span> : null}
              </p>
              <p className="text-sm text-wine/70">
                {a.email} · {a.ready ? "Authenticator set up" : "Waiting for setup"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.outline} disabled={pending} onClick={() => reset(a)}>
                {a.ready ? "Reset authenticator" : "New setup link"}
              </button>
              {a.isYou ? null : (
                <button type="button" className={btn.danger} disabled={pending} onClick={() => remove(a)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {link ? <SetupLink name={link.name} url={link.url} /> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="Name" error={fields.name}>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} error={fields.name} />
        </Field>
        <Field label="Email" error={fields.email}>
          <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required error={fields.email} />
        </Field>
        <button type="submit" className={btn.primary} disabled={pending}>
          Add admin
        </button>
      </form>
    </div>
  );
}

function SetupLink({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  const message = `Hi ${name}, use this link to set up your sign-in for the wedding admin (it works for 3 days): ${url}`;
  return (
    <Notice tone="info">
      Send this setup link to {name} privately. It works once, for 3 days, and shows their QR code until they finish.{" "}
      <span className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn.outline} onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={btn.primary}>
          Send on WhatsApp
        </a>
      </span>
    </Notice>
  );
}
