"use server";

// Public "request an invitation" (U11, D3, D10). Server Actions can be called directly by
// anyone, so all checks live in the service: validation, honeypot, rate limit, hashed IP.

import { headers } from "next/headers";
import { config } from "@/server/config";
import { getDb } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { requestInvitation } from "@/server/services/requests";

export type RequestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fields?: Record<string, string> };

export async function requestInvitationAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const h = await headers();
  const clientId = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const raw = Object.fromEntries(["fullName", "phone", "email", "message", "website"].map((k) => [k, String(formData.get(k) ?? "")]));

  try {
    await requestInvitation(getDb(), raw, { weddingSlug: config.weddingSlug(), clientId });
    return { status: "success" };
  } catch (err) {
    if (isAppError(err)) {
      const list = (err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
      return { status: "error", message: err.message, fields: Object.fromEntries(list.map((f) => [f.path, f.message])) };
    }
    console.error(err);
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
}
