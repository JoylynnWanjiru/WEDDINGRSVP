// The wedding content sections, shared by the public page and the personal invitation (D29: public).
// Each section hides itself when the couple hasn't filled it in.

import type { NavItem } from "@/components/InvitationNav";
import { Contacts } from "@/components/sections/Contacts";
import { DressCode } from "@/components/sections/DressCode";
import { Faq } from "@/components/sections/Faq";
import { GoodToKnow } from "@/components/sections/GoodToKnow";
import { Programme } from "@/components/sections/Programme";
import { Story } from "@/components/sections/Story";
import { Venues } from "@/components/sections/VenueCard";
import type { WeddingContent } from "@/server/services/content";

export function WeddingSections({ content }: { content: WeddingContent }) {
  return (
    <>
      <Story title={content.storyTitle} story={content.story} photos={content.photos} />
      <Programme items={content.programme} />
      <div id="details" className="guest-details">
        <Venues venues={content.venues} />
        <DressCode dressCode={content.dressCode} />
        <GoodToKnow contributionInfo={content.contributionInfo} />
        <Faq items={content.faq} />
        <Contacts contacts={content.contacts} />
      </div>
    </>
  );
}

/** Navigation entries for the sections above that have something to show. */
export function contentNav(content: WeddingContent): NavItem[] {
  const nav: NavItem[] = [];
  if (content.story || content.photos.some((p) => p.section === "story")) nav.push({ href: "#story", label: "Our story" });
  if (content.programme.length) nav.push({ href: "#programme", label: "The day" });
  nav.push({ href: "#details", label: "Details" });
  return nav;
}
