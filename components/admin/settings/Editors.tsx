"use client";

// The settings list editors. They're Client Components so they can hand their field layouts
// (functions) to ItemList; the server page passes them plain data only.

import { useState, useTransition } from "react";
import { resolveMapsLinkAction, saveDressCodeAction } from "@/app/admin/(dashboard)/settings/actions";
import { adminInput, btn, Field, Notice, TextInput } from "../ui";
import { fromEat, toEat } from "./eat";
import { ItemList, type ItemFormProps } from "./ItemList";

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const orNull = (s: string) => (s === "" ? null : s);

// --- venues ---

export type VenueItem = {
  id: string;
  kind: string;
  name: string;
  address: string | null;
  landmarks: string | null;
  lat: number | null;
  lng: number | null;
  parkingNotes: string | null;
  mapImageUrl: string | null;
};

function VenueFields({ item, errors }: ItemFormProps<VenueItem>) {
  const [lat, setLat] = useState(item?.lat?.toString() ?? "");
  const [lng, setLng] = useState(item?.lng?.toString() ?? "");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Venue name" error={errors.name}>
        <TextInput name="name" defaultValue={item?.name} required error={errors.name} />
      </Field>
      <Field label="Used for">
        <select name="kind" defaultValue={item?.kind ?? "ceremony"} className={adminInput}>
          <option value="ceremony">Ceremony (or the whole day)</option>
          <option value="reception">Reception</option>
          <option value="traditional">Traditional ceremony</option>
        </select>
      </Field>
      <Field label="Address / area">
        <TextInput name="address" defaultValue={item?.address ?? ""} />
      </Field>
      <Field label="Static map image (optional)" hint="/images/map.webp or an https:// link">
        <TextInput name="mapImageUrl" defaultValue={item?.mapImageUrl ?? ""} />
      </Field>
      <div className="space-y-2 sm:col-span-2">
        <Field label="Google Maps pin" hint="Paste a Google Maps link to fill in the pin, or type the numbers">
          <div className="flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" className={adminInput} />
            <button
              type="button"
              className={btn.outline}
              disabled={pending || !link.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await resolveMapsLinkAction(link);
                  if (res.ok) {
                    setLat(String(res.data!.lat));
                    setLng(String(res.data!.lng));
                    setMsg("Pin found. Save to keep it.");
                  } else setMsg(res.message);
                })
              }
            >
              {pending ? "…" : "Use link"}
            </button>
          </div>
        </Field>
        {msg ? <p className="text-sm text-wine/70">{msg}</p> : null}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" error={errors.lat}>
            <TextInput name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-1.2921" />
          </Field>
          <Field label="Longitude" error={errors.lng}>
            <TextInput name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="36.8219" />
          </Field>
        </div>
      </div>
      <div className="sm:col-span-2">
        <Field label="Landmarks / how to find the gate">
          <textarea name="landmarks" rows={2} defaultValue={item?.landmarks ?? ""} className={adminInput} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Parking">
          <textarea name="parkingNotes" rows={2} defaultValue={item?.parkingNotes ?? ""} className={adminInput} />
        </Field>
      </div>
    </div>
  );
}

export function VenuesEditor({ items }: { items: VenueItem[] }) {
  return (
    <ItemList
      kind="venue"
      items={items}
      title={(v) => v.name}
      summary={(v) => (v.lat != null ? "pin set" : "no pin yet")}
      addLabel="Add a venue"
      render={(p) => <VenueFields {...p} />}
      toValues={(f) => ({
        name: str(f, "name"),
        kind: str(f, "kind"),
        address: orNull(str(f, "address")),
        mapImageUrl: orNull(str(f, "mapImageUrl")),
        lat: str(f, "lat") === "" ? null : Number(str(f, "lat")),
        lng: str(f, "lng") === "" ? null : Number(str(f, "lng")),
        landmarks: orNull(str(f, "landmarks")),
        parkingNotes: orNull(str(f, "parkingNotes")),
      })}
    />
  );
}

// --- programme ---

export type ProgrammeRow = { id: string; startsAt: string; title: string; detail: string | null; venueId: string | null };

export function ProgrammeEditor({ items, venues, weddingDate }: { items: ProgrammeRow[]; venues: { id: string; name: string }[]; weddingDate: string }) {
  const time = (iso: string) => toEat(iso).time;
  return (
    <ItemList
      kind="programme"
      items={items}
      title={(p) => `${time(p.startsAt)} · ${p.title}`}
      addLabel="Add a programme item"
      render={({ item, errors }) => (
        <div className="grid gap-4 sm:grid-cols-[9rem_9rem_1fr]">
          <Field label="Day" hint="After midnight? Next day">
            <TextInput name="date" type="date" defaultValue={item ? toEat(item.startsAt).date : weddingDate} required />
          </Field>
          <Field label="Time (EAT)" error={errors.startsAt}>
            <TextInput name="time" type="time" defaultValue={item ? time(item.startsAt) : ""} required />
          </Field>
          <Field label="What happens" error={errors.title}>
            <TextInput name="title" defaultValue={item?.title} required error={errors.title} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Venue">
              <select name="venueId" defaultValue={item?.venueId ?? venues[0]?.id ?? ""} className={adminInput}>
                <option value="">Not set</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Detail for guests (optional)">
            <TextInput name="detail" defaultValue={item?.detail ?? ""} />
          </Field>
        </div>
      )}
      toValues={(f) => ({
        startsAt: fromEat(str(f, "date"), str(f, "time")),
        title: str(f, "title"),
        detail: orNull(str(f, "detail")),
        venueId: orNull(str(f, "venueId")),
      })}
    />
  );
}

// --- FAQ ---

export type FaqRow = { id: string; question: string; answer: string; sortOrder: number };

export function FaqEditor({ items }: { items: FaqRow[] }) {
  return (
    <ItemList
      kind="faq"
      items={items}
      title={(q) => q.question}
      addLabel="Add a question"
      render={({ item, errors }) => (
        <div className="space-y-4">
          <Field label="Question" error={errors.question}>
            <TextInput name="question" defaultValue={item?.question} required error={errors.question} />
          </Field>
          <Field label="Answer" error={errors.answer}>
            <textarea name="answer" rows={3} defaultValue={item?.answer} required className={adminInput} />
          </Field>
          <Field label="Order" hint="Lower numbers show first">
            <TextInput name="sortOrder" type="number" min={0} defaultValue={item?.sortOrder ?? items.length} />
          </Field>
        </div>
      )}
      toValues={(f) => ({ question: str(f, "question"), answer: str(f, "answer"), sortOrder: Number(str(f, "sortOrder") || 0) })}
    />
  );
}

// --- contacts ---

export type ContactRow = { id: string; role: string; name: string; phone: string | null; sortOrder: number };

export function ContactsEditor({ items }: { items: ContactRow[] }) {
  return (
    <ItemList
      kind="contact"
      items={items}
      title={(c) => `${c.role}: ${c.name}`}
      addLabel="Add a contact"
      render={({ item, errors }) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Role" error={errors.role} hint="e.g. MC, Head usher, Transport">
            <TextInput name="role" defaultValue={item?.role} required error={errors.role} />
          </Field>
          <Field label="Name" error={errors.name}>
            <TextInput name="name" defaultValue={item?.name} required error={errors.name} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <TextInput name="phone" type="tel" defaultValue={item?.phone ?? ""} error={errors.phone} />
          </Field>
          <Field label="Order">
            <TextInput name="sortOrder" type="number" min={0} defaultValue={item?.sortOrder ?? items.length} />
          </Field>
        </div>
      )}
      toValues={(f) => ({ role: str(f, "role"), name: str(f, "name"), phone: orNull(str(f, "phone")), sortOrder: Number(str(f, "sortOrder") || 0) })}
    />
  );
}

// --- photos ---

export type PhotoRow = { id: string; section: string; src: string; alt: string; sortOrder: number };

export function PhotosEditor({ items }: { items: PhotoRow[] }) {
  return (
    <ItemList
      kind="photo"
      items={items}
      title={(p) => p.alt || p.src}
      summary={(p) => p.src}
      addLabel="Add a photo"
      render={({ item, errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Image" error={errors.src} hint="Put the .webp in public/images, then type /images/name.webp">
            <TextInput name="src" defaultValue={item?.src ?? "/images/"} required error={errors.src} />
          </Field>
          <Field label="Description (for screen readers)">
            <TextInput name="alt" defaultValue={item?.alt ?? ""} />
          </Field>
          <Field label="Section">
            <select name="section" defaultValue={item?.section ?? "story"} className={adminInput}>
              <option value="story">Our story</option>
            </select>
          </Field>
          <Field label="Order">
            <TextInput name="sortOrder" type="number" min={0} defaultValue={item?.sortOrder ?? items.length} />
          </Field>
        </div>
      )}
      toValues={(f) => ({ src: str(f, "src"), alt: str(f, "alt"), section: str(f, "section"), sortOrder: Number(str(f, "sortOrder") || 0) })}
    />
  );
}

// --- dress code ---

export function DressCodeEditor({ value }: { value: { text: string; swatches: { name: string; hex: string }[] } | null }) {
  const [swatches, setSwatches] = useState(value?.swatches ?? []);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function save(form: FormData) {
    startTransition(async () => {
      const res = await saveDressCodeAction({ text: str(form, "text"), swatches: swatches.map((s) => ({ name: s.name.trim(), hex: s.hex.toUpperCase() })) });
      setNotice(res.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: res.message });
    });
  }

  return (
    <form action={save} className="space-y-4">
      <Field label="Guidance for guests">
        <textarea name="text" rows={3} defaultValue={value?.text ?? ""} required className={adminInput} />
      </Field>
      <div>
        <p className="label mb-2 text-[0.6rem] text-wine/70">Colours (guests can tap to copy the code)</p>
        <ul className="space-y-2">
          {swatches.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(s.hex) ? s.hex : "#000000"}
                onChange={(e) => setSwatches((xs) => xs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                className="h-11 w-14 cursor-pointer rounded-sm border border-wine/25 bg-white"
                aria-label={`Colour for ${s.name || "swatch"}`}
              />
              <input value={s.name} onChange={(e) => setSwatches((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name, e.g. Burgundy" className={adminInput} />
              <span className="w-20 shrink-0 font-mono text-sm uppercase">{s.hex}</span>
              <button type="button" className={btn.outline} onClick={() => setSwatches((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${s.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
        {swatches.length < 12 ? (
          <button type="button" className={`${btn.outline} mt-2`} onClick={() => setSwatches((xs) => [...xs, { name: "", hex: "#C9AB66" }])}>
            + Add a colour
          </button>
        ) : null}
      </div>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <button type="submit" className={btn.primary} disabled={pending}>
        {pending ? "Saving…" : "Save dress code"}
      </button>
    </form>
  );
}
