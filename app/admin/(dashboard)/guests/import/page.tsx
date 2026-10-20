// CSV import (U1, BLUEPRINT D11). The session is checked by the action on every call;
// this page itself shows no guest data, so it can prerender.

import Link from "next/link";
import { ImportForm } from "@/components/admin/ImportForm";

export const metadata = { title: "Import guests" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/guests" className="label text-[0.6rem] text-gold-deep underline underline-offset-4">
        ← All guests
      </Link>
      <header>
        <h1 className="font-display text-4xl">Import guests</h1>
        <p className="text-sm text-wine/60">You&rsquo;ll see a preview first. Nothing is saved until you press Import.</p>
      </header>
      <ImportForm />
    </div>
  );
}
