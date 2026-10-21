// Browser tab icon: the invitation's gold dove seal (replaces the starter favicon).

import { ImageResponse } from "next/og";
import { Seal } from "./_lib/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <Seal size={64} />
      </div>
    ),
    size,
  );
}
