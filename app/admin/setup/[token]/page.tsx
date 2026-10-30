// Authenticator setup for a new or reset admin (D26). Outside (dashboard): the person isn't
// signed in yet. A bad, expired or used link behaves like no link (BR-4).

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SetupForm } from "@/components/admin/SetupForm";
import { DoveSeal } from "@/components/envelope/DoveSeal";
import { base32 } from "@/server/auth/totp";
import { readAdminSetup } from "@/server/auth/admins";
import { getDb } from "@/server/db/client";
import { qrSvg } from "@/server/integrations/qr";

export const metadata = { title: "Set up sign-in", robots: { index: false, follow: false } };

export default function SetupRoute({ params }: PageProps<"/admin/setup/[token]">) {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <DoveSeal id="setup-seal" className="mx-auto h-16 w-16" />
        <Suspense fallback={<p className="label mt-8 text-pearl/70">Loading…</p>}>
          <Setup params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Setup({ params }: { params: PageProps<"/admin/setup/[token]">["params"] }) {
  const { token } = await params; // request-time: the suspension point
  const setup = await readAdminSetup(getDb(), token);
  if (!setup) redirect("/admin/login");

  const svg = await qrSvg(setup.uri);
  const key = base32(setup.secret).match(/.{1,4}/g)!.join(" ");

  return (
    <>
      <h1>Hello, {setup.admin.name}</h1>
      <p className="mt-2 text-sm text-pearl/80">
        Signing in to the wedding admin needs a code from an authenticator app on your phone, such as Google Authenticator or Microsoft
        Authenticator.
      </p>
      <ol className="mt-6 space-y-2 text-left text-sm text-pearl/90">
        <li>1. In the app, tap + and scan this code.</li>
        <li>2. Type the 6-digit code it shows below.</li>
      </ol>
      <div className="mx-auto mt-5 w-56 rounded-sm bg-white p-3" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 text-xs text-pearl/70">Can&apos;t scan? Enter this key in the app instead:</p>
      <p className="mt-1 font-mono text-sm tracking-wider text-gold select-all">{key}</p>
      <div className="mt-6">
        <SetupForm token={token} />
      </div>
    </>
  );
}
