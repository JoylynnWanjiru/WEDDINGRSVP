"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmSetupAction, type SetupState } from "@/app/admin/setup/[token]/actions";
import { Button } from "@/components/ui/Button";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(confirmSetupAction.bind(null, token), {});
  if (state.done) {
    return (
      <div role="status" className="space-y-4">
        <p className="text-pearl">All set. From now on, sign in with your email, the admin password and a code from your app.</p>
        <Link href="/admin/login" className="label inline-flex min-h-11 items-center text-gold underline underline-offset-4">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <label className="block text-left">
        <span className="label text-pearl/80">Code from your app</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          className="mt-2 w-full rounded-sm border border-gold/30 bg-wine-night/50 px-4 py-3 tracking-[0.3em] text-white focus:border-gold focus:outline-none"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-[#f3b3b3]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Finish setup"}
      </Button>
    </form>
  );
}
