"use client";

// Edit guest details. E21: sends the updatedAt it loaded, so a save after someone else's
// change is refused ("reload") instead of silently overwriting it.

import { useState, useTransition } from "react";
import { updateGuestAction } from "@/app/admin/(dashboard)/guests/actions";
import { adminInput, btn, Field, Notice, TextInput } from "./ui";

export type EditableGuest = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  group: string | null;
  side: string | null;
  seatAllowance: number;
  notes: string | null;
  updatedAt: string;
};

export function GuestEditForm({ guest }: { guest: EditableGuest }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function save(form: FormData) {
    const value = (k: string) => String(form.get(k) ?? "").trim();
    const patch = {
      fullName: value("fullName"),
      phone: value("phone") || null,
      email: value("email") || null,
      group: value("group") || null,
      side: value("side") || null,
      seatAllowance: Number(value("seatAllowance") || 0),
      notes: value("notes") || null,
    };
    startTransition(async () => {
      const res = await updateGuestAction(guest.id, patch, guest.updatedAt);
      setFields(res.ok ? {} : (res.fields ?? {}));
      setNotice(res.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: res.message });
    });
  }

  return (
    <form action={save} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name (as on the card)" error={fields.fullName}>
        <TextInput name="fullName" defaultValue={guest.fullName} required error={fields.fullName} />
      </Field>
      <Field label="Phone (WhatsApp)" error={fields.phone}>
        <TextInput name="phone" type="tel" defaultValue={guest.phone ?? ""} error={fields.phone} />
      </Field>
      <Field label="Email" error={fields.email}>
        <TextInput name="email" type="email" defaultValue={guest.email ?? ""} error={fields.email} />
      </Field>
      <Field label="Extra seats" error={fields.seatAllowance} hint="Can't go below the extras already named (BR-12)">
        <TextInput name="seatAllowance" type="number" min={0} max={20} defaultValue={guest.seatAllowance} error={fields.seatAllowance} />
      </Field>
      <Field label="Group">
        <TextInput name="group" defaultValue={guest.group ?? ""} />
      </Field>
      <Field label="Side">
        <select name="side" defaultValue={guest.side ?? ""} className={adminInput}>
          <option value="">Not set</option>
          <option value="bride">Bride</option>
          <option value="groom">Groom</option>
          <option value="both">Both</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Private notes">
          <textarea name="notes" rows={2} defaultValue={guest.notes ?? ""} className={adminInput} />
        </Field>
      </div>
      {notice ? (
        <div className="sm:col-span-2">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <button type="submit" className={btn.primary} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
