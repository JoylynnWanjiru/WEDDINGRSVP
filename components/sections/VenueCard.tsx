// Venue & live location (spec §6). Plain Google Maps links: free, open navigation on the phone.
// Each venue is a two-panel card: the name on a wine panel (or the map image), details beside it.

import { DoveSeal } from "@/components/envelope/DoveSeal";
import type { WeddingContent } from "@/server/services/content";
import { Section } from "./Section";

const KIND: Record<string, string> = { ceremony: "Ceremony", reception: "Reception", traditional: "Traditional ceremony" };

const linkBtn = "btn label inline-flex min-h-12 items-center justify-center px-6 py-3 transition-colors duration-300";

export function Venues({ venues }: { venues: WeddingContent["venues"] }) {
  if (!venues.length) return null;
  return (
    <Section id="venue" eyebrow="Where" title={venues.length > 1 ? "The venues" : "The venue"}>
      <div className="venue-list">
        {venues.map((v, i) => (
          <article key={i} className="venue-card">
            <div className="venue-panel">
              {v.mapImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a one-off static map screenshot (spec §6)
                <img src={v.mapImageUrl} alt={`Map showing ${v.name}`} loading="lazy" />
              ) : (
                <DoveSeal id={`venue-seal-${i}`} className="venue-seal" />
              )}
              {/* One venue hosts the whole day (A4): say so, rather than just "Ceremony". */}
              <p className="label">{venues.length === 1 ? "Ceremony & reception" : (KIND[v.kind] ?? v.kind)}</p>
              <h3 className="font-display">{v.name}</h3>
            </div>
            <div className="venue-details">
              {v.address ? (
                <div>
                  <p className="label">Address</p>
                  <p className="venue-address">{v.address}</p>
                </div>
              ) : null}
              {v.landmarks ? (
                <div>
                  <p className="label">Finding us</p>
                  <p>{v.landmarks}</p>
                </div>
              ) : null}
              {v.parkingNotes ? (
                <div>
                  <p className="label">Parking</p>
                  <p>{v.parkingNotes}</p>
                </div>
              ) : null}
              {v.directionsUrl ? (
                <div className="flex flex-wrap gap-3 pt-2">
                  <a href={v.directionsUrl} target="_blank" rel="noopener noreferrer" className={`${linkBtn} bg-wine text-gold hover:bg-burgundy`}>
                    Get directions
                  </a>
                  <a href={v.openInMapsUrl!} target="_blank" rel="noopener noreferrer" className={`${linkBtn} border border-wine/30 text-wine hover:border-wine hover:bg-wine/5`}>
                    Open in Maps
                  </a>
                </div>
              ) : (
                <p className="italic text-wine/70">The map pin will be added soon.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
