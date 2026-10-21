// Usher scanner (spec §9, Phase 5): PIN, camera, partial check-in, name search, offline (N3).
// Everything happens in the browser against /api/scan/*, which checks the usher session.

import { Scanner } from "@/components/scan/Scanner";

export const metadata = { title: "Gate scanner", robots: { index: false, follow: false } };

export default function ScanPage() {
  return <Scanner />;
}
