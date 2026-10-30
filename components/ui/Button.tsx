// Shared themed button. Gold on wine passes contrast for labels (spec §3, 7.4:1).
// `wine` is for light backgrounds: gold label on wine, never gold on ivory.
// Tap target ≥ 44 px (spec §15).

import type { ButtonHTMLAttributes } from "react";

type Variant = "gold" | "outline" | "wine";

const styles: Record<Variant, string> = {
  gold: "bg-gold text-wine-night hover:bg-[#d8be7e] disabled:bg-gold/50",
  outline: "border border-gold/60 text-gold hover:border-gold hover:bg-gold/10 disabled:opacity-50",
  wine: "bg-wine text-gold hover:bg-burgundy disabled:opacity-60",
};

export function Button({ variant = "gold", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`btn label inline-flex min-h-12 items-center justify-center gap-2 px-8 py-3 font-medium transition-colors duration-300 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}
