"use client";

// Add or edit one vendor team (D25). Arrival time is entered in Nairobi time (E15);
// phones in any Kenyan format become +254… on the server (BR-20).

import { useState, useTransition } from "react";
import { addVendorAction, updateVendorAction } from "@/app/admin/(dashboard)/vendors/actions";
import { Combobox } from "./Combobox";
import { fromEat, toEat } from "./settings/eat";
import { adminInput, btn, Field, Notice, TextInput } from "./ui";

export type VendorRow = {
  id: string;
  company: string;
  role: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  staffCount: number;
  mealCount: number;
  arriveAt: string | null;
  instructions: string | null;
  notes: string | null;
  arrivedCount: number;
  removed: boolean;
  link: string | null;
  whatsappUrl: string | null;
  updatedAt: string;
};

const ROLES = ["Photographer", "Videographer", "Caterer", "Decor", "Florist", "DJ / Sound", "MC", "Cake", "Transport", "Security", "Planner"];

export function VendorForm({ weddingDate, vendor, onDone }: { weddingDate: string; vendor?: VendorRow; onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const arrive = vendor?.arriveAt ? toEat(vendor.arriveAt) : { date: weddingDate, time: "" };
  const f = error?.fields ?? {};

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "").trim();
    const date = text("arriveDate");
    const time = text("arriveTime");
    const values: Record<string, unknown> = {
      company: text("company"),
      role: text("role"),
      contactName: text("contactName"),
      phone: text("phone"),
      email: text("email"),
      staffCount: text("staffCount"),
      instructions: text("instructions"),
      notes: text("notes"),
    };
    // Blank meals = one each (the server's default when adding; spelled out when editing).
    if (text("mealCount") !== "") values.mealCount = text("mealCount");
    else if (vendor) values.mealCount = text("staffCount");
    if (date && time) values.arriveAt = fromEat(date, time);

    startTransition(async () => {
      setAdded(null);
      if (vendor) {
        // Edit: blanks clear a field (null); the arrival time is cleared when either part is blank.
        const patch = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));
        patch.arriveAt = date && time ? fromEat(date, time) : null;
        const res = await updateVendorAction(vendor.id, patch, vendor.updatedAt);
        if (!res.ok) return setError(res);
        setError(null);
        onDone?.();
      } else {
        const res = await addVendorAction(values);
        if (!res.ok) return setError(res);
        setError(null);
        setAdded(String(values.company));
        form.reset();
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Company or name" error={f.company}>
        <TextInput name="company" required defaultValue={vendor?.company} autoComplete="off" error={f.company} />
      </Field>
      <Field label="Role" error={f.role} hint="Pick one or type your own">
        <Combobox name="role" required options={ROLES} defaultValue={vendor?.role} placeholder="e.g. Photographer" error={f.role} />
      </Field>
      <Field label="Contact person" error={f.contactName}>
        <TextInput name="contactName" defaultValue={vendor?.contactName ?? ""} error={f.contactName} />
      </Field>
      <Field label="Phone (WhatsApp)" error={f.phone} hint="Any format, e.g. 0712 345 678">
        <TextInput name="phone" type="tel" inputMode="tel" defaultValue={vendor?.phone ?? ""} error={f.phone} />
      </Field>
      <Field label="Email" error={f.email}>
        <TextInput name="email" type="email" defaultValue={vendor?.email ?? ""} error={f.email} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Staff on the day" error={f.staffCount} hint="Their pass admits this many">
          <TextInput name="staffCount" type="number" min={1} max={50} required defaultValue={vendor?.staffCount ?? 1} error={f.staffCount} />
        </Field>
        <Field label="Meals" error={f.mealCount} hint="Blank = one each">
          <TextInput name="mealCount" type="number" min={0} max={50} defaultValue={vendor?.mealCount} error={f.mealCount} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Arrival date" error={f.arriveAt}>
          <TextInput name="arriveDate" type="date" defaultValue={arrive.date} />
        </Field>
        <Field label="Arrival time (EAT)" hint="Blank = not set">
          <TextInput name="arriveTime" type="time" defaultValue={arrive.time} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Instructions for the vendor (they see this)" error={f.instructions} hint="e.g. Use the back gate; setup area is behind the tent">
          <textarea name="instructions" rows={2} defaultValue={vendor?.instructions ?? ""} className={adminInput} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Private notes (only you see these)" error={f.notes} hint="e.g. deposit paid, balance due">
          <textarea name="notes" rows={2} defaultValue={vendor?.notes ?? ""} className={adminInput} />
        </Field>
      </div>
      {error ? (
        <div className="sm:col-span-2">
          <Notice tone="error">{error.message}</Notice>
        </div>
      ) : null}
      {added ? (
        <div className="sm:col-span-2">
          <Notice tone="ok">{added} added. Share their link from the list below.</Notice>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
        </button>
        {onDone ? (
          <button type="button" className={btn.outline} onClick={onDone}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
