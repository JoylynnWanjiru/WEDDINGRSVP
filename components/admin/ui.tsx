// Small shared pieces for admin forms (light theme: wine on ivory/white).

import type { InputHTMLAttributes, ReactNode } from "react";

// Styles live in app/admin.css (.a-input, .a-btn, …) so every admin screen shares one look.
export const adminInput = "a-input";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="a-label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? <span className="mt-1 block text-xs text-wine/70">{hint}</span> : null}
      {error ? <span className="mt-1 block text-sm text-[#9b1c1c]">{error}</span> : null}
    </label>
  );
}

export function TextInput({ error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...props} aria-invalid={!!error} className={adminInput} />;
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const cls = { error: "bg-[#f8e1e1] text-[#7a1d1d]", ok: "bg-[#dff0e4] text-[#1d5c33]", info: "bg-gold/15 text-wine border-gold-deep" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`a-notice ${cls}`}>
      {children}
    </p>
  );
}

export const btn = {
  primary: "a-btn a-btn--primary",
  outline: "a-btn a-btn--outline",
  danger: "a-btn a-btn--danger",
};
