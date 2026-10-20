// Contacts: tap to call or WhatsApp (spec §4, §5). Phones are stored as +254… (BR-20).

import { Section } from "./Section";

export function Contacts({ contacts }: { contacts: { role: string; name: string; phone: string | null }[] }) {
  if (!contacts.length) return null;
  return (
    <Section id="contacts" eyebrow="Need help?" title="Contacts">
      <ul className="mx-auto grid max-w-md gap-4">
        {contacts.map((c, i) => (
          <li key={i} className="flex items-center justify-between gap-4 rounded-sm border border-wine/15 bg-white px-4 py-3">
            <div>
              <p className="label text-[0.6rem] text-gold-deep">{c.role}</p>
              <p className="font-display text-xl">{c.name}</p>
            </div>
            {c.phone ? (
              <div className="flex shrink-0 gap-2">
                <a href={`tel:${c.phone}`} className="label inline-flex min-h-11 items-center rounded-sm bg-wine px-3 text-[0.6rem] text-gold">
                  Call
                </a>
                <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="label inline-flex min-h-11 items-center rounded-sm border border-wine/40 px-3 text-[0.6rem]">
                  WhatsApp
                </a>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
