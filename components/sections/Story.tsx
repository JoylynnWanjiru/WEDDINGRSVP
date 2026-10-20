// Our story (approved only, BR-1). Photos are pre-compressed .webp in /public (spec §14).

import type { ApprovedContent } from "@/server/services/content";
import { Section } from "./Section";

export function Story({ story, photos }: { story: string | null; photos: ApprovedContent["photos"] }) {
  const storyPhotos = photos.filter((p) => p.section === "story");
  if (!story && !storyPhotos.length) return null;
  return (
    <Section id="story" eyebrow="A celebration of us" title="Our story">
      {story ? (
        <div className="mx-auto max-w-prose space-y-4 text-center text-lg leading-relaxed">
          {story.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : null}
      {storyPhotos.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3">
          {storyPhotos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- pre-compressed, served as-is (spec §14)
            <img key={p.src} src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/5] w-full rounded-sm object-cover" />
          ))}
        </div>
      ) : null}
    </Section>
  );
}
