"use client";

// Wedding details and switches (spec §8 Settings). Times are EAT. Changing the date moves the
// programme with it (D23).

import { useState, useTransition } from "react";
import { saveWeddingAction } from "@/app/admin/(dashboard)/settings/actions";
import { adminInput, btn, Field, Notice, TextInput } from "../ui";
import { fromEat, toEat } from "./eat";

export type WeddingValues = {
  brideName: string;
  groomName: string;
  monogram: string | null;
  weddingDate: string;
  ceremonyStartAt: string;
  gatesOpenAt: string;
  rsvpDeadline: string;
  venueCapacity: number | null;
  defaultSeatAllowance: number;
  storyTitle: string | null;
  storyText: string | null;
  hashtag: string | null;
  whatsappTemplate: string | null;
  contributionInfo: Record<string, string> | null;
  publicRequestsEnabled: boolean;
  autoApprove: boolean;
  dailyEmailCap: number;
  reminderIntervalDays: number;
};

export function WeddingForm({ w }: { w: WeddingValues }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const ceremony = toEat(w.ceremonyStartAt);
  const gates = toEat(w.gatesOpenAt);
  const deadline = toEat(w.rsvpDeadline);

  function save(form: FormData) {
    const v = (k: string) => String(form.get(k) ?? "").trim();
    const date = v("weddingDate");
    // "Label: value" lines → { Label: value } (e.g. "M-Pesa Paybill: 123456").
    const contributions = Object.fromEntries(
      v("contributionInfo")
        .split("\n")
        .map((l) => l.split(/:(.*)/).map((x) => x?.trim()))
        .filter(([k, val]) => k && val),
    );
    const patch = {
      brideName: v("brideName"),
      groomName: v("groomName"),
      monogram: v("monogram") || null,
      weddingDate: date,
      ceremonyStartAt: fromEat(date, v("ceremonyTime")),
      gatesOpenAt: fromEat(date, v("gatesTime")),
      rsvpDeadline: fromEat(v("deadlineDate"), v("deadlineTime")),
      venueCapacity: v("venueCapacity") ? Number(v("venueCapacity")) : null,
      defaultSeatAllowance: Number(v("defaultSeatAllowance") || 0),
      storyTitle: v("storyTitle") || null,
      storyText: v("storyText") || null,
      hashtag: v("hashtag") || null,
      whatsappTemplate: v("whatsappTemplate") || null,
      contributionInfo: Object.keys(contributions).length ? contributions : null,
      publicRequestsEnabled: form.get("publicRequestsEnabled") === "on",
      autoApprove: form.get("autoApprove") === "on",
      dailyEmailCap: Number(v("dailyEmailCap")),
      reminderIntervalDays: Number(v("reminderIntervalDays")),
    };
    startTransition(async () => {
      const res = await saveWeddingAction(patch);
      setFields(res.ok ? {} : (res.fields ?? {}));
      if (!res.ok) return setNotice({ tone: "error", text: res.message });
      const moved = res.data?.programmeShiftedDays ?? 0;
      setNotice({ tone: "ok", text: moved ? `Saved. The programme moved ${Math.abs(moved)} day${Math.abs(moved) === 1 ? "" : "s"} with the new date.` : "Saved." });
    });
  }

  return (
    <form action={save} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bride's name" error={fields.brideName}>
          <TextInput name="brideName" defaultValue={w.brideName} required error={fields.brideName} />
        </Field>
        <Field label="Groom's name" error={fields.groomName}>
          <TextInput name="groomName" defaultValue={w.groomName} required error={fields.groomName} />
        </Field>
        <Field label="Monogram (on the seal)" hint="e.g. A & B">
          <TextInput name="monogram" defaultValue={w.monogram ?? ""} maxLength={10} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Wedding date" error={fields.weddingDate} hint="Moves the programme too">
          <TextInput name="weddingDate" type="date" defaultValue={w.weddingDate} required error={fields.weddingDate} />
        </Field>
        <Field label="Gates open (EAT)" error={fields.gatesOpenAt}>
          <TextInput name="gatesTime" type="time" defaultValue={gates.time} required />
        </Field>
        <Field label="Ceremony starts (EAT)" error={fields.ceremonyStartAt}>
          <TextInput name="ceremonyTime" type="time" defaultValue={ceremony.time} required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="RSVP deadline (date)" error={fields.rsvpDeadline}>
          <TextInput name="deadlineDate" type="date" defaultValue={deadline.date} required />
        </Field>
        <Field label="Time (EAT)">
          <TextInput name="deadlineTime" type="time" defaultValue={deadline.time} required />
        </Field>
        <Field label="Venue capacity" error={fields.venueCapacity} hint="Warns before approving past it">
          <TextInput name="venueCapacity" type="number" min={1} defaultValue={w.venueCapacity ?? ""} />
        </Field>
        <Field label="Default extra seats" hint="For new guests">
          <TextInput name="defaultSeatAllowance" type="number" min={0} max={20} defaultValue={w.defaultSeatAllowance} />
        </Field>
      </div>

      <Field label="Our story title" hint="Press Enter to split it over two lines">
        <textarea name="storyTitle" rows={2} maxLength={80} defaultValue={w.storyTitle ?? ""} className={adminInput} />
      </Field>
      <Field label="Our story (approved guests only)" hint="Blank line between paragraphs. Leave empty to hide the section.">
        <textarea name="storyText" rows={6} defaultValue={w.storyText ?? ""} className={adminInput} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp message" hint="Placeholders: {firstName} {brideName} {groomName} {date} {personalLink} {rsvpDeadline}">
          <textarea name="whatsappTemplate" rows={6} defaultValue={w.whatsappTemplate ?? ""} className={adminInput} />
        </Field>
        <Field label="Gifts & contributions (approved guests only)" hint="One per line, e.g. M-Pesa Paybill: 123456">
          <textarea
            name="contributionInfo"
            rows={6}
            defaultValue={Object.entries(w.contributionInfo ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            className={adminInput}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hashtag">
          <TextInput name="hashtag" defaultValue={w.hashtag ?? ""} placeholder="#OurWedding2026" />
        </Field>
        <Field label="Emails per day" error={fields.dailyEmailCap} hint="Gmail allows ~500; keep ≤ 450 (BR-17)">
          <TextInput name="dailyEmailCap" type="number" min={0} max={450} defaultValue={w.dailyEmailCap} />
        </Field>
        <Field label="Reminder every (days)" hint="To guests who haven't answered">
          <TextInput name="reminderIntervalDays" type="number" min={1} max={30} defaultValue={w.reminderIntervalDays} />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="autoApprove" defaultChecked={w.autoApprove} className="h-4 w-4 accent-[#3D0F19]" />
        <span>Approve a &ldquo;Yes&rdquo; automatically (D24). Added guests and going over capacity still come to you.</span>
      </label>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="publicRequestsEnabled" defaultChecked={w.publicRequestsEnabled} className="h-4 w-4 accent-[#3D0F19]" />
        <span>Show the &ldquo;Request an invitation&rdquo; form on the public page (D21: off)</span>
      </label>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <button type="submit" className={btn.primary} disabled={pending}>
        {pending ? "Saving…" : "Save wedding details"}
      </button>
    </form>
  );
}
