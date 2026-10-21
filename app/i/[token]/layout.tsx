import type { Metadata } from "next";
import { shareMetadata } from "../../_lib/share";

// Personal links must never appear in search results (spec §12). The X-Robots-Tag
// header in next.config.ts says the same for crawlers that ignore meta tags. The link
// preview in WhatsApp is the same for every guest: it never names who the link is for.
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await shareMetadata()), robots: { index: false, follow: false } };
}

export default function InvitationLayout({ children }: LayoutProps<"/i/[token]">) {
  return children;
}
