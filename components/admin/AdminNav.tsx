"use client";

// Admin section links. A client component only to mark the current page (aria-current);
// the links themselves are plain <Link>s, so the static layout still prerenders. The pathname
// is runtime data, so it reads inside <Suspense>; the fallback is the same links, unmarked.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/admin", label: "Dashboard", icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>) },
  { href: "/admin/guests", label: "Guests", icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3 2.4 3.5 5.2" /></>) },
  { href: "/admin/vendors", label: "Vendors", icon: icon(<><rect x="3" y="7" width="18" height="13" rx="1.5" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>) },
  { href: "/admin/settings", label: "Settings", icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>) },
  { href: "/admin/tools", label: "Tools", icon: icon(<><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></>) },
];

function Links({ path }: { path: string | null }) {
  const active = (href: string) => path !== null && (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav aria-label="Admin" className="admin-nav">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
          {n.icon}
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function CurrentLinks() {
  return <Links path={usePathname()} />;
}

export function AdminNav() {
  return (
    <Suspense fallback={<Links path={null} />}>
      <CurrentLinks />
    </Suspense>
  );
}

export const SignOutIcon = () =>
  icon(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11" /></>);
