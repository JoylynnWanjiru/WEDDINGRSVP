// Small shared pieces for admin forms (light theme: wine on ivory/white).

import type { InputHTMLAttributes, ReactNode } from "react";

export const adminInput =
  "w-full rounded-sm border border-wine/25 bg-white px-3 py-2.5 text-wine placeholder:text-wine/40 focus:border-gold-deep focus:outline-none disabled:bg-wine/5";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-[0.6rem] text-wine/70">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? <span className="mt-1 block text-xs text-wine/50">{hint}</span> : null}
      {error ? <span className="mt-1 block text-sm text-[#9b1c1c]">{error}</span> : null}
    </label>
  );
}

export function TextInput({ error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...props} aria-invalid={!!error} className={adminInput} />;
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const cls = { error: "bg-[#f8e1e1] text-[#7a1d1d]", ok: "bg-[#dff0e4] text-[#1d5c33]", info: "bg-gold/15 text-wine" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-sm px-4 py-3 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export const btn = {
  primary: "label inline-flex min-h-11 items-center justify-center rounded-sm bg-wine px-4 text-[0.62rem] text-gold disabled:opacity-50",
  outline: "label inline-flex min-h-11 items-center justify-center rounded-sm border border-wine/30 bg-white px-4 text-[0.62rem] text-wine hover:border-wine disabled:opacity-50",
  danger: "label inline-flex min-h-11 items-center justify-center rounded-sm border border-[#9b1c1c]/40 bg-white px-4 text-[0.62rem] text-[#9b1c1c] disabled:opacity-50",
};
