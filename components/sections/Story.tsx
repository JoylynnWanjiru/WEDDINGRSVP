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
      <div className={storyPhotos.length ? "grid items-center gap-8 md:grid-cols-[1fr_1.2fr]" : undefined}>
        {story ? (
          <div className="mx-auto max-w-prose space-y-4 text-center text-lg leading-relaxed md:text-left">
            {story.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : null}
        {storyPhotos.length ? (
          <div className="grid grid-cols-2 gap-3">
            {storyPhotos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- pre-compressed, served as-is (spec §14)
              <img
                key={p.src}
                src={p.src}
                alt={p.alt}
                loading="lazy"
                className={`aspect-[4/5] w-full rounded-sm object-cover ${i % 2 ? "translate-y-6" : ""}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
