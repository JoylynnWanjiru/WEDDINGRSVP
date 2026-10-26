"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/Button";

const input =
  "mt-2 w-full rounded-sm border border-gold/30 bg-wine-night/50 px-4 py-3 text-white focus:border-gold focus:outline-none";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block text-left">
        <span className="label text-pearl/80">Your email</span>
        <input name="email" type="email" autoComplete="username" required autoFocus className={input} />
      </label>
      <label className="block text-left">
        <span className="label text-pearl/80">Admin password</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="block text-left">
        <span className="label text-pearl/80">Code from your authenticator app</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          className={`${input} tracking-[0.3em]`}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-[#f3b3b3]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
