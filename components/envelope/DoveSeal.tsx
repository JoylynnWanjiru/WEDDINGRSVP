// Gold wax seal with a white dove (spec §3 motifs). Pure SVG: crisp at any size, no image file.
// `id` keeps gradient ids unique when more than one seal is on a page.

// `size` sets pixel width/height, for generated images (app/opengraph-image.tsx) where CSS classes don't apply.
export function DoveSeal({ id = "seal", monogram, className = "", size }: { id?: string; monogram?: string | null; className?: string; size?: number }) {
  // Irregular wax edge: a circle with 14 soft bumps.
  const bumps = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 === 0 ? 48 : 45.5;
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label="Gold wax seal with a dove">
      <defs>
        <radialGradient id={`${id}-wax`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#E9D49A" />
          <stop offset="45%" stopColor="#C9AB66" />
          <stop offset="100%" stopColor="#9C6934" />
        </radialGradient>
        <radialGradient id={`${id}-inner`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#D8BE7E" />
          <stop offset="100%" stopColor="#A9783F" />
        </radialGradient>
      </defs>

      <polygon points={bumps} fill={`url(#${id}-wax)`} stroke="#8A5A26" strokeWidth="0.6" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="36" fill={`url(#${id}-inner)`} stroke="#8A5A26" strokeOpacity="0.6" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="32.5" fill="none" stroke="#F2E3B8" strokeOpacity="0.55" strokeWidth="0.6" strokeDasharray="1.2 1.6" />

      {/* Dove in flight, carrying an olive sprig */}
      <g fill="#FFFFFF" stroke="#E2D7D1" strokeWidth="0.4" strokeLinejoin="round">
        <path d="M33 54 C39 52 44 50 49 50 C53 50 57 51 61 53 C65 55 68 56 71 55 C68 58 64 60 59 60 C54 60 50 59 46 60 C42 61 37 59 33 54 Z" />
        <path d="M47 51 C45 44 46 37 51 31 C53 37 55 43 55 50 Z" />
        <path d="M52 51 C55 43 61 38 69 36 C66 42 62 47 57 52 Z" />
        <path d="M33 54 C30 53 27 51 25 48 C29 49 31 49 34 51 Z" />
        <circle cx="68.5" cy="54.2" r="2.6" />
      </g>
      <path d="M71 55 L74.5 55.4 L71.2 56.6 Z" fill="#C9AB66" />
      <circle cx="69.3" cy="53.6" r="0.55" fill="#3D0F19" />
      <path d="M74 56 C76 58 77 60 76.5 63" fill="none" stroke="#F2E3B8" strokeWidth="0.7" strokeLinecap="round" />
      <ellipse cx="75.5" cy="59.5" rx="1.4" ry="0.7" transform="rotate(50 75.5 59.5)" fill="#F2E3B8" />
      <ellipse cx="77" cy="62" rx="1.4" ry="0.7" transform="rotate(70 77 62)" fill="#F2E3B8" />

      {monogram ? (
        <text x="50" y="74" textAnchor="middle" fontFamily="var(--font-cormorant), Georgia, serif" fontSize="8" fontStyle="italic" fill="#5E1F2D" letterSpacing="0.5">
          {monogram}
        </text>
      ) : null}
    </svg>
  );
}
