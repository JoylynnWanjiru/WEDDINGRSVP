// Email open pixel (E12: a hint only). Always answers with the same 1x1 GIF,
// whether or not the token is valid, so it reveals nothing.
import { getDb } from "@/server/db/client";
import { recordEmailOpen } from "@/server/services/messaging";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_request: Request, ctx: RouteContext<"/api/track/open/[id]">) {
  const { id } = await ctx.params;
  try {
    await recordEmailOpen(getDb(), id);
  } catch (err) {
    console.error(err); // never break the email for a tracking failure
  }
  return new Response(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" },
  });
}
