// The URL inside a gate-pass QR (spec §9). Ushers' scanners read the code themselves;
// this page only appears if someone opens the QR with a normal camera. It never reads
// the token, so it reveals nothing and can be served as a static page.

import { DoveSeal } from "@/components/envelope/DoveSeal";

export const metadata = { title: "Gate pass", robots: { index: false, follow: false } };

export default function ScannedWithCamera() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <DoveSeal id="scan-seal" className="h-20 w-20" />
      <h1 className="font-display text-4xl text-gold">This is a gate pass</h1>
      <p className="max-w-sm text-pearl/85">Please show this QR code to an usher at the gate. They&rsquo;ll scan it to welcome you in.</p>
    </main>
  );
}
