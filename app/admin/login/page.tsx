// Admin login (spec §8). Outside (dashboard), so it is never behind the session check.

import { LoginForm } from "@/components/admin/LoginForm";
import { DoveSeal } from "@/components/envelope/DoveSeal";

export const metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <DoveSeal id="login-seal" className="mx-auto h-16 w-16 drop-shadow-[0_6px_12px_#120104]" />
        <h1>Wedding admin</h1>
        <p className="mt-2 mb-8 text-sm text-pearl/70">For the couple and the planner.</p>
        <LoginForm />
      </div>
    </main>
  );
}
