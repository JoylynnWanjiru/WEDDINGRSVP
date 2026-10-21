// Admin frame: static navigation that prerenders instantly. The session is NOT read here
// (Next.js guide: a top-level read would hold every page behind it); each page reads it
// inside <Suspense> via getAdmin(), and every Server Action checks it again.

import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = { title: "Wedding admin", robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/guests", label: "Guests" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/tools", label: "Tools" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-ivory text-wine">
      <header className="sticky top-0 z-30 border-b border-gold/30 bg-wine text-pearl">
        <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4">
          <span className="mr-3 shrink-0 font-display text-xl text-gold">Admin</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="label inline-flex min-h-12 shrink-0 items-center px-3 text-[0.65rem] hover:text-gold">
              {n.label}
            </Link>
          ))}
          <form action={logoutAction} className="ml-auto shrink-0">
            <button type="submit" className="label min-h-12 px-3 text-[0.65rem] text-pearl/70 hover:text-gold">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
