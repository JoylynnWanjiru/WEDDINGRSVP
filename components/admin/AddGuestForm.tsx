"use client";

// Add one guest (U1). Phones in any Kenyan format become +254… (BR-20); a duplicate phone
// points to the guest who already has it (BR-21).

import Link from "next/link";
import { useActionState } from "react";
import { addGuestAction, type AddState } from "@/app/admin/(dashboard)/guests/actions";
import { adminInput, btn, Field, Notice, TextInput } from "./ui";

export function AddGuestForm({ defaultSeatAllowance }: { defaultSeatAllowance: number }) {
  const [state, action, pending] = useActionState<AddState, FormData>(addGuestAction, { status: "idle" });
  const f = state.status === "error" ? (state.fields ?? {}) : {};

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name (as on the card)" error={f.fullName}>
        <TextInput name="fullName" required autoComplete="off" error={f.fullName} />
      </Field>
      <Field label="Phone (WhatsApp)" error={f.phone} hint="Any format, e.g. 0712 345 678">
        <TextInput name="phone" type="tel" inputMode="tel" error={f.phone} />
      </Field>
      <Field label="Email" error={f.email}>
        <TextInput name="email" type="email" error={f.email} />
      </Field>
      <Field label="Extra seats" error={f.seatAllowance} hint={`How many people they may bring (default ${defaultSeatAllowance})`}>
        <TextInput name="seatAllowance" type="number" min={0} max={20} placeholder={String(defaultSeatAllowance)} error={f.seatAllowance} />
      </Field>
      <Field label="Group" hint="e.g. Bride's family, Friends, Church, Work">
        <TextInput name="group" />
      </Field>
      <Field label="Side">
        <select name="side" className={adminInput} defaultValue="">
          <option value="">Not set</option>
          <option value="bride">Bride</option>
          <option value="groom">Groom</option>
          <option value="both">Both</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Private notes (only the couple sees these)">
          <textarea name="notes" rows={2} className={adminInput} />
        </Field>
      </div>
      {state.status === "error" ? (
        <div className="sm:col-span-2">
          <Notice tone="error">
            {state.message}{" "}
            {state.existingId ? (
              <Link href={`/admin/guests/${state.existingId}`} className="underline">
                Open that guest
              </Link>
            ) : null}
          </Notice>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "Adding…" : "Add guest"}
        </button>
      </div>
    </form>
  );
}
