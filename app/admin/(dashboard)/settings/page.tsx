// Settings (U12, spec §8): everything couple-specific lives here, not in the code.

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ContactsEditor, DressCodeEditor, FaqEditor, PhotosEditor, ProgrammeEditor, VenuesEditor } from "@/components/admin/settings/Editors";
import { WeddingForm } from "@/components/admin/settings/WeddingForm";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/services/admin/settings";
import { getAdmin } from "../../_lib/auth";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="text-sm text-wine/60">Changes show on the guest pages straight away. All times are East Africa Time.</p>
      </header>
      <Suspense fallback={<p className="text-wine/60">Loading settings…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

function Panel({ id, title, hint, children, open }: { id: string; title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <details id={id} open={open} className="scroll-mt-16 rounded-sm border border-wine/10 bg-white">
      <summary className="flex min-h-14 cursor-pointer flex-wrap items-baseline gap-x-3 px-5 py-4">
        <span className="font-display text-2xl">{title}</span>
        {hint ? <span className="text-sm text-wine/50">{hint}</span> : null}
      </summary>
      <div className="border-t border-wine/10 p-5">{children}</div>
    </details>
  );
}

async function Settings() {
  const ctx = await getAdmin();
  const s = await getSettings(getDb(), ctx);
  const w = s.wedding;
  const iso = (d: Date) => d.toISOString();

  return (
    <>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Settings sections">
        {[
          ["#wedding", "Wedding"],
          ["#venues", "Venue"],
          ["#programme", "Programme"],
          ["#dress", "Dress code"],
          ["#faq", "FAQ"],
          ["#contacts", "Contacts"],
          ["#photos", "Photos"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-wine/15 bg-white px-3 py-1.5 hover:border-gold-deep">
            {label}
          </a>
        ))}
      </nav>

      <Panel id="wedding" title="Wedding details" hint={`${w.brideName} & ${w.groomName} · ${w.weddingDate}`} open>
        <WeddingForm
          w={{
            brideName: w.brideName,
            groomName: w.groomName,
            monogram: w.monogram,
            weddingDate: w.weddingDate,
            ceremonyStartAt: iso(w.ceremonyStartAt),
            gatesOpenAt: iso(w.gatesOpenAt),
            rsvpDeadline: iso(w.rsvpDeadline),
            venueCapacity: w.venueCapacity,
            defaultSeatAllowance: w.defaultSeatAllowance,
            storyTitle: w.storyTitle,
            storyText: w.storyText,
            hashtag: w.hashtag,
            whatsappTemplate: w.whatsappTemplate,
            contributionInfo: w.contributionInfo ?? null,
            publicRequestsEnabled: w.publicRequestsEnabled,
            dailyEmailCap: w.dailyEmailCap,
            reminderIntervalDays: w.reminderIntervalDays,
          }}
        />
      </Panel>

      <Panel id="venues" title="Venue" hint={s.venues.map((v) => v.name).join(", ")}>
        <VenuesEditor items={s.venues.map((v) => ({ id: v.id, kind: v.kind, name: v.name, address: v.address, landmarks: v.landmarks, lat: v.lat, lng: v.lng, parkingNotes: v.parkingNotes, mapImageUrl: v.mapImageUrl }))} />
      </Panel>

      <Panel id="programme" title="Order of the day" hint={`${s.programme.length} items`}>
        <ProgrammeEditor
          weddingDate={w.weddingDate}
          venues={s.venues.map((v) => ({ id: v.id, name: v.name }))}
          items={s.programme.map((p) => ({ id: p.id, startsAt: iso(p.startsAt), title: p.title, detail: p.detail, venueId: p.venueId }))}
        />
      </Panel>

      <Panel id="dress" title="Dress code" hint={`${s.dressCode?.swatches.length ?? 0} colours`}>
        <DressCodeEditor value={s.dressCode ? { text: s.dressCode.text, swatches: s.dressCode.swatches } : null} />
      </Panel>

      <Panel id="faq" title="Questions & answers" hint={`${s.faq.length} questions`}>
        <FaqEditor items={s.faq.map((f) => ({ id: f.id, question: f.question, answer: f.answer, sortOrder: f.sortOrder }))} />
      </Panel>

      <Panel id="contacts" title="Contacts" hint="Shown to approved guests: tap to call or WhatsApp">
        <ContactsEditor items={s.contacts.map((c) => ({ id: c.id, role: c.role, name: c.name, phone: c.phone, sortOrder: c.sortOrder }))} />
      </Panel>

      <Panel id="photos" title="Photos" hint="For Our story">
        <PhotosEditor items={s.photos.map((p) => ({ id: p.id, section: p.section, src: p.src, alt: p.alt, sortOrder: p.sortOrder }))} />
      </Panel>

      <p className="text-sm text-wine/60">
        See it as a guest: open any approved guest from the{" "}
        <Link href="/admin/guests?status=approved" className="text-gold-deep underline">
          guest list
        </Link>{" "}
        and choose <em>Open as guest</em>.
      </p>
    </>
  );
}
