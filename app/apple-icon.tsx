// Home-screen icon when someone adds the site to their phone (e.g. ushers saving /scan):
// the gold dove seal on the invitation's wine colour.

import { ImageResponse } from "next/og";
import { Seal } from "./_lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3D0F19" }}>
        <Seal size={150} />
      </div>
    ),
    size,
  );
}
