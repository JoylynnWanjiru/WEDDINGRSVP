import type { Metadata } from "next";

// Personal links must never appear in search results (spec §12). The X-Robots-Tag
// header in next.config.ts says the same for crawlers that ignore meta tags.
export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
};

export default function InvitationLayout({ children }: LayoutProps<"/i/[token]">) {
  return children;
}
