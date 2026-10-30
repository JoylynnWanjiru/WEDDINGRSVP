// Section navigation for the one-page invitation (D22, like the reference site).
// Plain anchor links: work without JavaScript. Only sections this guest can see are listed.

export type NavItem = { href: string; label: string };

export function InvitationNav({ items }: { items: NavItem[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Sections" className="invitation-nav sticky top-0 z-30 w-full">
      <ul className="mx-auto flex overflow-x-auto px-2 [scrollbar-width:none]">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a href={item.href} className="label">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
