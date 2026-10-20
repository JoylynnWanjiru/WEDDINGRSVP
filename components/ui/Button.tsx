// Shared themed button. Gold on wine passes contrast for labels (spec §3, 7.4:1).
// Tap target ≥ 44 px (spec §15).

import type { ButtonHTMLAttributes } from "react";

type Variant = "gold" | "outline";

const styles: Record<Variant, string> = {
  gold: "bg-gold text-wine hover:bg-[#d6bb7c] disabled:bg-gold/50",
  outline: "border border-gold/70 text-gold hover:bg-gold/10 disabled:opacity-50",
};

export function Button({ variant = "gold", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`label inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-6 py-3 font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}
