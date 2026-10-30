// Contacts: tap to call or WhatsApp (spec §4, §5). Phones are stored as +254… (BR-20).

import { Section } from "./Section";

export function Contacts({ contacts }: { contacts: { role: string; name: string; phone: string | null }[] }) {
  if (!contacts.length) return null;
  return (
    <Section id="contacts" eyebrow="Need help?" title="Contacts">
      <ul className="contact-grid">
        {contacts.map((c, i) => (
          <li key={i} className="contact-card">
            <p className="label">{c.role}</p>
            <p className="font-display contact-name">{c.name}</p>
            {c.phone ? (
              <div className="contact-actions">
                <a href={`tel:${c.phone}`} className="label">
                  Call
                </a>
                <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="label">
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
