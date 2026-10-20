// Section navigation for the one-page invitation (D22, like the reference site).
// Plain anchor links: work without JavaScript. Only sections this guest can see are listed.

export type NavItem = { href: string; label: string };

export function InvitationNav({ items }: { items: NavItem[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Sections" className="sticky top-0 z-30 w-full border-b border-gold/20 bg-wine/90 backdrop-blur supports-[backdrop-filter]:bg-wine/75">
      <ul className="mx-auto flex max-w-2xl justify-center gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a href={item.href} className="label inline-flex min-h-11 items-center px-3 text-[0.62rem] text-pearl/85 hover:text-gold">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
