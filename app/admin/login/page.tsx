// Admin login (spec §8). Outside (dashboard), so it is never behind the session check.

import { LoginForm } from "@/components/admin/LoginForm";
import { DoveSeal } from "@/components/envelope/DoveSeal";

export const metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <DoveSeal id="login-seal" className="mx-auto h-16 w-16" />
        <h1 className="mt-4 font-display text-4xl">Wedding admin</h1>
        <p className="mt-2 mb-8 text-sm text-pearl/70">For the couple and the planner.</p>
        <LoginForm />
      </div>
    </main>
  );
}
