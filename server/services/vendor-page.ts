// A vendor's own page, /vendor/[token] (D25): their arrival time and instructions, the
// programme, venues, contacts and the team's gate pass. requireVendor() runs first, so a
// removed vendor or an unknown link gets nothing (BR-2, BR-4).

import type { Db } from "../db/client";
import { qrSvg } from "../integrations/qr";
import { requireVendor } from "./access";
import { getVendorContent } from "./content";
import { scanUrl, vendorPassTokenFor } from "./gate";

export async function getVendorPage(db: Db, token: string | null | undefined) {
  const access = await requireVendor(db, token);
  const { vendor: v, wedding } = access;
  const [content, passToken] = await Promise.all([getVendorContent(db, access), vendorPassTokenFor(v)]);
  return {
    wedding: { brideName: wedding.brideName, groomName: wedding.groomName, weddingDate: wedding.weddingDate },
    // Never the couple's private notes about the vendor.
    vendor: { company: v.company, role: v.role, contactName: v.contactName, staffCount: v.staffCount, mealCount: v.mealCount, arriveAt: v.arriveAt, instructions: v.instructions },
    pass: { staffCount: v.staffCount, arrivedCount: v.arrivedCount, scanUrl: scanUrl(passToken), qrSvg: await qrSvg(scanUrl(passToken)) },
    ...content,
  };
}

export type VendorPage = Awaited<ReturnType<typeof getVendorPage>>;
