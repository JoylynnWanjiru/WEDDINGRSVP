// Vendors (D25, spec §8): a separate list from guests. Each team gets a personal link with
// their arrival time, the programme, directions, contacts and the team's gate pass.

import { Suspense } from "react";
import { VendorForm } from "@/components/admin/VendorForm";
import { VendorList } from "@/components/admin/VendorList";
import { getDb } from "@/server/db/client";
import { loadWedding } from "@/server/services/admin/context";
import { listVendors } from "@/server/services/admin/vendors";
import { getAdmin } from "../../_lib/auth";

export const metadata = { title: "Vendors" };

export default function VendorsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">Vendors</h1>
        <p className="max-w-2xl text-sm text-wine/70">
          Photographers, caterers, decor, DJ… Each team gets a link with their arrival time, the programme, directions, your contacts and a gate pass for the
          whole team. They never see guests, and they don&rsquo;t count in the guest numbers.
        </p>
      </header>
      <Suspense fallback={<p className="text-wine/70">Loading vendors…</p>}>
        <Vendors />
      </Suspense>
    </div>
  );
}

async function Vendors() {
  const ctx = await getAdmin();
  const db = getDb();
  const [wedding, vendors] = await Promise.all([loadWedding(db, ctx), listVendors(db, ctx)]);
  const active = vendors.filter((v) => !v.removed);
  const sum = (k: "staffCount" | "mealCount" | "arrivedCount") => active.reduce((n, v) => n + v[k], 0);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Teams", active.length],
          ["Staff", sum("staffCount")],
          ["Meals", sum("mealCount")],
          ["Arrived", sum("arrivedCount")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-sm border border-wine/10 bg-white px-4 py-3">
            <dt className="label text-[0.6rem] text-wine/70">{label}</dt>
            <dd className="font-display text-3xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="rounded-sm border border-wine/10 bg-white p-5" open={!vendors.length}>
        <summary className="label min-h-11 cursor-pointer content-center text-[0.65rem] text-wine">+ Add a vendor</summary>
        <div className="mt-4">
          <VendorForm weddingDate={wedding.weddingDate} />
        </div>
      </details>

      <VendorList
        weddingDate={wedding.weddingDate}
        vendors={vendors.map((v) => ({ ...v, arriveAt: v.arriveAt?.toISOString() ?? null, updatedAt: v.updatedAt.toISOString() }))}
      />
    </>
  );
}
