// Gold divider: fading hairlines around a small open diamond with two dots (spec §3 motifs).
// Decorative only. Colour follows `currentColor`, so callers pick gold or gold-deep.

export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`ornament flex items-center justify-center gap-3 ${className.includes("text-") ? "" : "text-gold"} ${className}`}>
      <span className="h-px w-14 bg-gradient-to-r from-transparent to-current opacity-60" />
      <svg width="34" height="10" viewBox="0 0 34 10" fill="none" stroke="currentColor" strokeWidth="0.9">
        <circle cx="3" cy="5" r="1.1" fill="currentColor" stroke="none" />
        <path d="M17 1 L21 5 L17 9 L13 5 Z" />
        <path d="M17 3.4 L18.6 5 L17 6.6 L15.4 5 Z" fill="currentColor" stroke="none" />
        <circle cx="31" cy="5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
      <span className="h-px w-14 bg-gradient-to-l from-transparent to-current opacity-60" />
    </div>
  );
}
