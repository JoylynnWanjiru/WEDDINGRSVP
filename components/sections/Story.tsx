// Our story (approved only, BR-1). Photos are pre-compressed .webp in /public (spec §14).
// Text beside a photo collage on wide screens; stacked on phones.

import type { ApprovedContent } from "@/server/services/content";
import { Section } from "./Section";

export function Story({ title, story, photos }: { title: string | null; story: string | null; photos: ApprovedContent["photos"] }) {
  const storyPhotos = photos.filter((p) => p.section === "story");
  if (!story && !storyPhotos.length) return null;
  // A line break in the title (e.g. "Two hearts,\none home") is kept.
  const heading = title ? title.split("\n").flatMap((line, i) => (i ? [<br key={i} />, line] : [line])) : "A celebration of us";

  return (
    <Section id="story" eyebrow="Our story" title={heading}>
      <div className="story-layout">
        {story ? (
          <div className="story-prose">
            {story.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : null}
        {storyPhotos.length ? (
          <div className="story-gallery">
            {storyPhotos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element -- pre-compressed, served as-is (spec §14)
              <img
                key={p.src}
                src={p.src}
                alt={p.alt}
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
