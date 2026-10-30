// Admin frame: static navigation that prerenders instantly. The session is NOT read here
// (Next.js guide: a top-level read would hold every page behind it); each page reads it
// inside <Suspense> via getAdmin(), and every Server Action checks it again.
// Sidebar on wide screens, a scrollable top bar on phones (styles in app/admin.css).

import type { Metadata } from "next";
import { AdminNav, SignOutIcon } from "@/components/admin/AdminNav";
import { DoveSeal } from "@/components/envelope/DoveSeal";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = { title: "Wedding admin", robots: { index: false, follow: false } };

function SignOut() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="admin-signout">
        <SignOutIcon />
        <span>Sign out</span>
      </button>
    </form>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side-inner">
          <div className="admin-brand">
            <DoveSeal id="admin-seal" />
            <div>
              <p>Wedding</p>
              <p>Admin</p>
            </div>
          </div>
          <AdminNav />
          <SignOut />
          <div className="admin-side-foot">
            <p>For the couple and the planner. Times are East Africa Time (EAT).</p>
            <SignOut />
          </div>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
