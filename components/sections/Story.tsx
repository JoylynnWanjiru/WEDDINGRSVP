// Our story (public since D29; was approved-only under BR-1). Photos are pre-compressed .webp in /public (spec §14).
// The story reads as one centred passage; the photos follow as a staggered gallery of
// arch-topped and square frames (any number of photos keeps the rhythm).

import type { WeddingContent } from "@/server/services/content";
import { Section } from "./Section";

export function Story({ title, story, photos }: { title: string | null; story: string | null; photos: WeddingContent["photos"] }) {
  const storyPhotos = photos.filter((p) => p.section === "story");
  if (!story && !storyPhotos.length) return null;
  // A line break in the title (e.g. "Two hearts,\none home") is kept.
  const heading = title ? title.split("\n").flatMap((line, i) => (i ? [<br key={i} />, line] : [line])) : "A celebration of us";

  return (
    <Section id="story" eyebrow="Our story" title={heading}>
      {story ? (
        <div className="story-prose">
          {story.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : null}
      {storyPhotos.length ? (
        <div className="story-gallery" data-count={storyPhotos.length}>
          {storyPhotos.map((p) => (
            <figure key={p.src}>
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-compressed, served as-is (spec §14) */}
              <img src={p.src} alt={p.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
