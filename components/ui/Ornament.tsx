// Gold divider: thin rules with a small diamond (spec §3 motifs). Decorative only.

export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex items-center justify-center gap-3 text-gold ${className}`}>
      <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/80" />
      <svg width="10" height="10" viewBox="0 0 10 10" className="rotate-45">
        <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/80" />
    </div>
  );
}
