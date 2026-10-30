"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/Button";

const input = "admin-auth-input";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block text-left">
        <span className="label text-[0.6rem] text-pearl/75">Your email</span>
        <input name="email" type="email" autoComplete="username" required autoFocus className={input} />
      </label>
      <label className="block text-left">
        <span className="label text-[0.6rem] text-pearl/75">Admin password</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="block text-left">
        <span className="label text-[0.6rem] text-pearl/75">Code from your authenticator app</span>
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
