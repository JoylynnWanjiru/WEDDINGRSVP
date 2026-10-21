// The picture in a link preview (WhatsApp, Facebook, X…): the dove seal, the couple's
// names and the date on the invitation's wine and gold. Names and date only (§4a).
// Made at request time from the database, so nothing about the couple is hard-coded.

import { io } from "next/cache";
import { ImageResponse } from "next/og";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { getShareCard } from "@/server/services/share";
import { googleFont, Seal } from "./_lib/og";

export const alt = "A wedding invitation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  await io(); // request time only: never touch the database while building
  const card = await getShareCard(getDb(), config.weddingSlug()).catch(() => null);
  const couple = card?.couple ?? "You're invited";
  const label = "You're invited";
  const date = card?.date ?? "";
  // The invitation's two fonts: Cormorant (script) for the names, Jost for the small lines.
  const [script, sans] = await Promise.all([googleFont("Cormorant Garamond", "ital,wght@1,500", couple), googleFont("Jost", "wght@400", `${label.toUpperCase()}${date}`)]);
  const fonts = [
    ...(script ? [{ name: "Cormorant", data: script, style: "italic" as const, weight: 500 as const }] : []),
    ...(sans ? [{ name: "Jost", data: sans, style: "normal" as const, weight: 400 as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #5E1F2D 0%, #3D0F19 55%, #28030A 100%)",
          color: "#F7F1E8",
          border: "14px solid #C9AB66",
        }}
      >
        <Seal size={150} />
        {card ? (
          <div style={{ marginTop: 26, fontSize: 30, letterSpacing: 10, fontFamily: "Jost", color: "#C9AB66" }}>{label.toUpperCase()}</div>
        ) : null}
        <div style={{ marginTop: 14, fontSize: 92, fontFamily: "Cormorant", fontStyle: "italic", color: "#E9D49A", textAlign: "center", padding: "0 60px" }}>
          {couple}
        </div>
        {date ? <div style={{ marginTop: 18, fontSize: 34, letterSpacing: 3, fontFamily: "Jost", color: "#F7F1E8" }}>{date}</div> : null}
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
