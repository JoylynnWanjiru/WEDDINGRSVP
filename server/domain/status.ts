// Invitation lifecycle (BLUEPRINT §5). A key seam: change only deliberately.
// Services must get every new status from nextStatus(); nothing else assigns one.
// Status is where the guest is in the process. Delivery facts (sent, opened,
// pass emailed) are timestamps on the invitation, never statuses (BLUEPRINT D2).

import { AppError } from "../errors";

export const INVITATION_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "awaiting_approval",
  "declined",
  "approved",
  "not_approved",
  "partially_arrived",
  "arrived",
  "revoked",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** BR-1: the only states that unlock event details and the gate pass. */
export const UNLOCKED_STATUSES: ReadonlySet<InvitationStatus> = new Set(["approved", "partially_arrived", "arrived"]);

export const isUnlocked = (s: InvitationStatus) => UNLOCKED_STATUSES.has(s);

/** States in which the guest may still submit or edit an RSVP (deadline checked separately). */
const RESPONDABLE: ReadonlySet<InvitationStatus> = new Set([
  "draft",
  "sent",
  "viewed",
  "awaiting_approval",
  "declined",
  "approved",
]);

export const canRespond = (s: InvitationStatus) => RESPONDABLE.has(s);

export type StatusAction =
  | { type: "send" }
  | { type: "view" }
  | { type: "respond_yes"; partyGrew: boolean }
  | { type: "respond_no" }
  | { type: "approve" }
  | { type: "decline_attendance" }
  | { type: "reopen" }
  | { type: "admit"; arrivedAfter: number; partySize: number }
  | { type: "revoke" }
  | { type: "restore"; previous: InvitationStatus | null };

function invalid(from: InvitationStatus, action: StatusAction["type"]): never {
  throw new AppError("INVALID_TRANSITION", `Cannot ${action.replace("_", " ")} an invitation that is ${from}`, {
    from,
    action,
  });
}

/** Returns the status after `action`, or throws INVALID_TRANSITION. Same status = allowed no-op. */
export function nextStatus(from: InvitationStatus, action: StatusAction): InvitationStatus {
  switch (action.type) {
    case "send":
      // Re-sending is allowed and keeps the current status; only the timestamp changes.
      if (from === "revoked") return invalid(from, action.type);
      return from === "draft" ? "sent" : from;

    case "view":
      // A draft can be viewed if the couple shared the link without marking it sent.
      if (from === "draft" || from === "sent") return "viewed";
      return from;

    case "respond_yes":
      if (!canRespond(from)) return invalid(from, action.type);
      // BR-8: approved guests stay approved unless they added someone.
      if (from === "approved" && !action.partyGrew) return from;
      return "awaiting_approval";

    case "respond_no":
      return canRespond(from) ? "declined" : invalid(from, action.type);

    case "approve":
      // Approval issues the pass: there is no separate "pass issued" stage.
      return from === "awaiting_approval" ? "approved" : invalid(from, action.type);

    case "decline_attendance":
      return from === "awaiting_approval" ? "not_approved" : invalid(from, action.type);

    case "reopen":
      return from === "not_approved" ? "awaiting_approval" : invalid(from, action.type);

    case "admit":
      // BR-13
      if (from !== "approved" && from !== "partially_arrived") return invalid(from, action.type);
      return action.arrivedAfter >= action.partySize ? "arrived" : "partially_arrived";

    case "revoke":
      return from === "arrived" || from === "revoked" ? invalid(from, action.type) : "revoked";

    case "restore":
      if (from !== "revoked" || !action.previous) return invalid(from, action.type);
      return action.previous;
  }
}

// --- public invitation requests (separate from invitations, BLUEPRINT §5b / D3) ---

export const REQUEST_STATUSES = ["pending", "accepted", "rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type RequestAction = { type: "accept" } | { type: "reject" } | { type: "reopen" };

export function nextRequestStatus(from: RequestStatus, action: RequestAction): RequestStatus {
  if (action.type === "accept" && from === "pending") return "accepted";
  if (action.type === "reject" && from === "pending") return "rejected";
  if (action.type === "reopen" && from === "rejected") return "pending";
  throw new AppError("INVALID_TRANSITION", `Cannot ${action.type} a request that is ${from}`, { from, action: action.type });
}
