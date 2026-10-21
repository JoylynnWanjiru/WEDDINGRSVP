"use client";

// RSVP form (spec §7, BLUEPRINT BR-5 to BR-8). The browser helps (it won't add more guests
// than the allowance), but every rule is enforced again on the server.

import { useState, useTransition } from "react";
import { submitRsvpAction } from "@/app/i/[token]/actions";
import { Button } from "./ui/Button";

const DIETARY: { value: string; label: string }[] = [
  { value: "none", label: "No requirements" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "gluten_free", label: "Gluten-free" },
  { value: "other", label: "Allergy / other (tell us)" },
];

const EVENT_LABEL: Record<string, string> = { ceremony: "Ceremony", reception: "Reception", traditional: "Traditional ceremony" };

type Member = { fullName: string; isChild: boolean; dietary: string; dietaryNotes: string };

export type RsvpFormProps = {
  token: string;
  seatAllowance: number;
  weddingEvents: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  initial: {
    attending: boolean | null;
    primary: Member;
    extras: Member[];
    events: string[];
    message: string;
  };
};

const input =
  "w-full rounded-sm border border-wine/25 bg-white px-3 py-2.5 text-wine placeholder:text-wine/60 focus:border-gold-deep focus:outline-none";
const label = "label text-[0.65rem] text-wine/70";

export function RsvpForm({ token, seatAllowance, weddingEvents, hasEmail, hasPhone, initial }: RsvpFormProps) {
  const [attending, setAttending] = useState<boolean | null>(initial.attending);
  const [primary, setPrimary] = useState<Member>(initial.primary);
  const [extras, setExtras] = useState<Member[]>(initial.extras);
  const [events, setEvents] = useState<string[]>(initial.events.length ? initial.events : weddingEvents);
  const [message, setMessage] = useState(initial.message);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateExtra = (i: number, patch: Partial<Member>) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const clean = (m: Member) => ({ ...m, dietaryNotes: m.dietary === "other" ? m.dietaryNotes : undefined });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (attending === null) return setFormError("Please choose whether you can attend.");
    const payload = attending
      ? {
          attending: true,
          primary: { fullName: primary.fullName, dietary: primary.dietary, dietaryNotes: clean(primary).dietaryNotes },
          extras: extras.map(clean),
          events: weddingEvents.length > 1 ? events : undefined,
          phone,
          email,
          message,
        }
      : { attending: false, phone, email, message };
    startTransition(async () => {
      const res = await submitRsvpAction(token, payload);
      if (res.ok) {
        setErrors({});
        setFormError(null);
      } else {
        setErrors(res.fields ?? {});
        setFormError(res.fields && Object.keys(res.fields).length ? "Please check the highlighted fields." : res.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 text-left" noValidate>
      <fieldset>
        <legend className="font-display text-2xl text-wine">Will you be joining us?</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            [true, "Joyfully accepts"],
            [false, "Regretfully declines"],
          ].map(([value, text]) => (
            <label
              key={String(value)}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 ${attending === value ? "border-gold-deep bg-gold/15" : "border-wine/20 bg-white"}`}
            >
              <input type="radio" name="attending" checked={attending === value} onChange={() => setAttending(value as boolean)} className="accent-[#8A5A26]" />
              <span className="text-wine">{text as string}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {attending ? (
        <>
          <MemberFields title="You" member={primary} onChange={(p) => setPrimary({ ...primary, ...p })} errors={errors} prefix="primary" hideChild />

          <fieldset className="space-y-4">
            <legend className="font-display text-xl text-wine">Your guests</legend>
            <p className="text-sm text-wine/70">
              {seatAllowance === 0
                ? "This invitation is for you only."
                : `Your invitation includes up to ${seatAllowance} extra ${seatAllowance === 1 ? "guest" : "guests"}. Please name each person.`}
            </p>
            {extras.map((m, i) => (
              <div key={i} className="rounded-sm border border-wine/15 bg-white/60 p-4">
                <MemberFields title={`Guest ${i + 1}`} member={m} onChange={(p) => updateExtra(i, p)} errors={errors} prefix={`extras.${i}`} />
                <button type="button" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} className="label mt-1 inline-flex min-h-11 items-center text-[0.65rem] text-gold-deep underline">
                  Remove
                </button>
              </div>
            ))}
            {extras.length < seatAllowance ? (
              <Button type="button" variant="outline" className="!border-gold-deep !text-gold-deep" onClick={() => setExtras((xs) => [...xs, { fullName: "", isChild: false, dietary: "none", dietaryNotes: "" }])}>
                + Add a guest
              </Button>
            ) : null}
          </fieldset>

          {weddingEvents.length > 1 ? (
            <fieldset>
              <legend className="font-display text-xl text-wine">You&rsquo;ll attend</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {weddingEvents.map((ev) => (
                  <label key={ev} className="flex min-h-11 items-center gap-2 rounded-sm border border-wine/20 bg-white px-3">
                    <input
                      type="checkbox"
                      checked={events.includes(ev)}
                      onChange={(e) => setEvents((xs) => (e.target.checked ? [...xs, ev] : xs.filter((x) => x !== ev)))}
                      className="accent-[#8A5A26]"
                    />
                    <span className="text-wine">{EVENT_LABEL[ev] ?? ev}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}

      {attending !== null ? (
        <fieldset className="space-y-4">
          <legend className="font-display text-xl text-wine">Contact details</legend>
          <label className="block">
            <span className={label}>Phone (WhatsApp){hasPhone ? " · leave blank to keep the one we have" : ""}</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className={`${input} mt-1.5`} aria-invalid={!!errors.phone} />
            {errors.phone ? <Err text={errors.phone} /> : null}
          </label>
          <label className="block">
            <span className={label}>Email{hasEmail ? " · leave blank to keep the one we have" : ""}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1.5`} aria-invalid={!!errors.email} />
            {errors.email ? <Err text={errors.email} /> : null}
          </label>
          <label className="block">
            <span className={label}>A message to the couple (optional)</span>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${input} mt-1.5 resize-y`} />
          </label>
        </fieldset>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-sm bg-[#f8e1e1] px-4 py-3 text-sm text-[#7a1d1d]">
          {formError}
        </p>
      ) : null}

      <p className="text-xs text-wine/70">Your details are used only for this wedding and deleted afterwards.</p>
      <Button type="submit" disabled={pending || attending === null} className="w-full !bg-wine !text-gold hover:!bg-burgundy">
        {pending ? "Sending…" : "Send my response"}
      </Button>
    </form>
  );
}

function MemberFields({
  title,
  member,
  onChange,
  errors,
  prefix,
  hideChild,
}: {
  title: string;
  member: Member;
  onChange: (patch: Partial<Member>) => void;
  errors: Record<string, string>;
  prefix: string;
  hideChild?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="label text-[0.65rem] text-gold-deep">{title}</p>
      <label className="block">
        <span className={label}>Full name</span>
        <input value={member.fullName} onChange={(e) => onChange({ fullName: e.target.value })} autoComplete={hideChild ? "name" : "off"} className={`${input} mt-1.5`} aria-invalid={!!errors[`${prefix}.fullName`]} />
        {errors[`${prefix}.fullName`] ? <Err text={errors[`${prefix}.fullName`]} /> : null}
      </label>
      {hideChild ? null : (
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={member.isChild} onChange={(e) => onChange({ isChild: e.target.checked })} className="accent-[#8A5A26]" />
          <span className="text-sm text-wine">Child</span>
        </label>
      )}
      <label className="block">
        <span className={label}>Dietary needs</span>
        <select value={member.dietary} onChange={(e) => onChange({ dietary: e.target.value })} className={`${input} mt-1.5`}>
          {DIETARY.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      {member.dietary === "other" ? (
        <label className="block">
          <span className={label}>Tell us more</span>
          <input value={member.dietaryNotes} onChange={(e) => onChange({ dietaryNotes: e.target.value })} placeholder="e.g. nut allergy" className={`${input} mt-1.5`} />
        </label>
      ) : null}
    </div>
  );
}

const Err = ({ text }: { text: string }) => <span className="mt-1 block text-sm text-[#9b1c1c]">{text}</span>;
