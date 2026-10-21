import "server-only";

// Link-preview metadata (Open Graph) for pages people share: the home page and personal
// invitation links. WhatsApp and other preview bots get these tags in <head>, because
// Next.js doesn't stream metadata to them. The picture is app/opengraph-image.tsx.

import type { Metadata } from "next";
import { io } from "next/cache";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { getShareCard } from "@/server/services/share";

const GENERIC = { title: "You're invited", description: "A private celebration." };
const IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "A wedding invitation" }; // app/opengraph-image.tsx

export async function shareMetadata(): Promise<Metadata> {
  await io(); // request time only: never touch the database while building
  const card = await getShareCard(getDb(), config.weddingSlug()).catch(() => null); // a preview must never break the page
  const { title, description } = card ?? GENERIC;
  return {
    title,
    description,
    // The picture is named here because a page's openGraph replaces the parent's, image included.
    openGraph: { title, description, type: "website", siteName: card?.couple, images: [IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [IMAGE] },
  };
}
