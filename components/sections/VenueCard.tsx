// Venue & live location (spec §6). Plain Google Maps links: free, open navigation on the phone.

import type { ApprovedContent } from "@/server/services/content";
import { Section } from "./Section";

const KIND: Record<string, string> = { ceremony: "Ceremony", reception: "Reception", traditional: "Traditional ceremony" };

const linkBtn = "label inline-flex min-h-11 items-center justify-center rounded-sm px-5 py-3 text-[0.7rem]";

export function Venues({ venues }: { venues: ApprovedContent["venues"] }) {
  if (!venues.length) return null;
  return (
    <Section id="venue" eyebrow="Where" title={venues.length > 1 ? "The venues" : "The venue"}>
      <div className="space-y-8">
        {venues.map((v, i) => (
          <article key={i} className="text-center">
            {/* One venue hosts the whole day (A4): say so, rather than just "Ceremony". */}
            <p className="label text-[0.65rem] text-gold-deep">{venues.length === 1 ? "Ceremony & reception" : (KIND[v.kind] ?? v.kind)}</p>
            <h3 className="mt-1 font-display text-2xl">{v.name}</h3>
            {v.address ? <p className="mt-1">{v.address}</p> : null}
            {v.mapImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a one-off static map screenshot (spec §6)
              <img src={v.mapImageUrl} alt={`Map showing ${v.name}`} loading="lazy" className="mx-auto mt-4 w-full max-w-md rounded-sm" />
            ) : null}
            {v.landmarks ? <p className="mx-auto mt-3 max-w-md text-sm text-wine/75">{v.landmarks}</p> : null}
            {v.parkingNotes ? (
              <p className="mx-auto mt-2 max-w-md text-sm text-wine/75">
                <span className="font-medium">Parking:</span> {v.parkingNotes}
              </p>
            ) : null}
            {v.directionsUrl ? (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <a href={v.directionsUrl} target="_blank" rel="noopener noreferrer" className={`${linkBtn} bg-wine text-gold hover:bg-burgundy`}>
                  Get directions
                </a>
                <a href={v.openInMapsUrl!} target="_blank" rel="noopener noreferrer" className={`${linkBtn} border border-wine/40 text-wine hover:bg-wine/5`}>
                  Open in Maps
                </a>
              </div>
            ) : (
              <p className="mt-4 text-sm italic text-wine/60">The map pin will be added soon.</p>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}
