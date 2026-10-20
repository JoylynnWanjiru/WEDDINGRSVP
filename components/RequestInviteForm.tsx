"use client";

// Public request-an-invitation form (U11). Works without JavaScript too (progressive
// enhancement), and shows the same thank-you whether or not the person is already invited (D10).

import { useActionState } from "react";
import { requestInvitationAction, type RequestState } from "@/app/(public)/actions";
import { Button } from "./ui/Button";

const inputClass =
  "w-full rounded-sm border border-gold/30 bg-wine-night/50 px-4 py-3 text-white placeholder:text-pearl/40 focus:border-gold focus:outline-none";

function Field({ label, name, error, ...props }: { label: string; name: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-left">
      <span className="label text-pearl/80">{label}</span>
      <input name={name} {...props} aria-invalid={!!error} className={`${inputClass} mt-2`} />
      {error ? <span className="mt-1 block text-sm text-[#f3b3b3]">{error}</span> : null}
    </label>
  );
}

export function RequestInviteForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestInvitationAction, { status: "idle" });

  if (state.status === "success") {
    return (
      <div className="rounded-sm border border-gold/40 bg-wine-night/40 p-6 text-center" role="status">
        <p className="font-display text-2xl text-gold">Thank you</p>
        <p className="mt-2 text-pearl">Your request is with the couple. If they can invite you, you&rsquo;ll receive a personal link.</p>
      </div>
    );
  }

  const fields = state.status === "error" ? (state.fields ?? {}) : {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Full name" name="fullName" autoComplete="name" required error={fields.fullName} />
      <Field label="Phone (WhatsApp)" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" error={fields.phone} />
      <Field label="Email" name="email" type="email" autoComplete="email" error={fields.email} />
      <label className="block text-left">
        <span className="label text-pearl/80">Message to the couple (optional)</span>
        <textarea name="message" rows={3} className={`${inputClass} mt-2 resize-y`} />
      </label>

      {/* E19 honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.status === "error" && !Object.keys(fields).length ? (
        <p className="text-sm text-[#f3b3b3]" role="alert">
          {state.message}
        </p>
      ) : null}

      <p className="text-xs text-pearl/60">Your details are used only for this wedding and deleted afterwards.</p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Request an invitation"}
      </Button>
    </form>
  );
}
