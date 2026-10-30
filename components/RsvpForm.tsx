"use client";

// RSVP form (spec §7, BLUEPRINT BR-5 to BR-8). The browser helps (it won't add more guests
// than the allowance), but every rule is enforced again on the server.
// Used on the personal link and, since D29, on the public page (`publicMode`: phone required,
// a name for a "No", and the E19 honeypot).

import { useState, useTransition } from "react";
import type { RsvpActionResult } from "@/app/i/[token]/actions";
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
  /** The server action that saves the answer (personal link: bound to the token; public page: D29). */
  action: (payload: unknown) => Promise<RsvpActionResult>;
  publicMode?: boolean;
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

// Underlined fields on the paper card, like filling in a printed reply card.
const input = "rsvp-input";
const label = "label rsvp-label";

export function RsvpForm({ action, publicMode, seatAllowance, weddingEvents, hasEmail, hasPhone, initial }: RsvpFormProps) {
  const [attending, setAttending] = useState<boolean | null>(initial.attending);
  const [primary, setPrimary] = useState<Member>(initial.primary);
  const [extras, setExtras] = useState<Member[]>(initial.extras);
  const [events, setEvents] = useState<string[]>(initial.events.length ? initial.events : weddingEvents);
  const [message, setMessage] = useState(initial.message);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // E19 honeypot (public page only)
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
      : { attending: false, phone, email, message, ...(publicMode ? { fullName: primary.fullName } : {}) };
    startTransition(async () => {
      const res = await action(publicMode ? { ...payload, website } : payload);
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
    <form onSubmit={submit} className="rsvp-form text-left" noValidate>
      <fieldset>
        <legend className="rsvp-legend font-display">Will you be joining us?</legend>
        <div className="rsvp-choices">
          {[
            [true, "Joyfully accepts"],
            [false, "Regretfully declines"],
          ].map(([value, text]) => (
            <label key={String(value)} className="rsvp-choice" data-checked={attending === value}>
              <input type="radio" name="attending" checked={attending === value} onChange={() => setAttending(value as boolean)} className="sr-only" />
              <span className="rsvp-choice-mark" aria-hidden />
              <span className="font-display">{text as string}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {attending ? (
        <>
          <MemberFields title="You" member={primary} onChange={(p) => setPrimary({ ...primary, ...p })} errors={errors} prefix="primary" hideChild />

          <fieldset className="space-y-4">
            <legend className="rsvp-legend font-display">Your guests</legend>
            <p className="rsvp-help">
              {seatAllowance === 0
                ? "This invitation is for you only."
                : `Your invitation includes up to ${seatAllowance} extra ${seatAllowance === 1 ? "guest" : "guests"}. Please name each person.`}
            </p>
            {extras.map((m, i) => (
              <div key={i} className="rsvp-guest">
                <MemberFields title={`Guest ${i + 1}`} member={m} onChange={(p) => updateExtra(i, p)} errors={errors} prefix={`extras.${i}`} />
                <button type="button" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} className="label rsvp-link mt-1">
                  Remove
                </button>
              </div>
            ))}
            {extras.length < seatAllowance ? (
              <button type="button" className="label rsvp-add" onClick={() => setExtras((xs) => [...xs, { fullName: "", isChild: false, dietary: "none", dietaryNotes: "" }])}>
                + Add a guest
              </button>
            ) : null}
          </fieldset>

          {weddingEvents.length > 1 ? (
            <fieldset>
              <legend className="rsvp-legend font-display">You&rsquo;ll attend</legend>
              <div className="mt-3 flex flex-wrap gap-3">
                {weddingEvents.map((ev) => (
                  <label key={ev} className="rsvp-check">
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
          <legend className="rsvp-legend font-display">Contact details</legend>
          {publicMode && !attending ? (
            <label className="block">
              <span className={label}>Your full name</span>
              <input value={primary.fullName} onChange={(e) => setPrimary({ ...primary, fullName: e.target.value })} autoComplete="name" required className={`${input} mt-1.5`} aria-invalid={!!errors.fullName} />
              {errors.fullName ? <Err text={errors.fullName} /> : null}
            </label>
          ) : null}
          <label className="block">
            <span className={label}>Phone (WhatsApp){publicMode ? " · required" : hasPhone ? " · leave blank to keep the one we have" : ""}</span>
            <input type="tel" inputMode="tel" autoComplete="tel" required={publicMode} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className={`${input} mt-1.5`} aria-invalid={!!errors.phone} />
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

      {publicMode ? (
        // E19 honeypot: hidden from people and screen readers; bots fill it in.
        <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Website <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="border-l-2 border-[#9b1c1c] bg-[#f8e1e1] px-4 py-3 text-sm text-[#7a1d1d]">
          {formError}
        </p>
      ) : null}

      <p className="rsvp-help text-xs">Your details are used only for this wedding and deleted afterwards.</p>
      <Button type="submit" variant="wine" disabled={pending || attending === null} className="w-full">
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
      <p className="label rsvp-member-title">{title}</p>
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
