// Status banners on the personal invitation (spec §4a).
// A framed card with the dove seal on its top edge, like a note tucked into the invitation.

import type { ReactNode } from "react";
import { DoveSeal } from "@/components/envelope/DoveSeal";

function Banner({ tone, children }: { tone: "gold" | "soft"; children: ReactNode }) {
  return (
    <div className="guest-status-wrap">
      <div role="status" className="guest-status" data-tone={tone}>
        <DoveSeal id={`status-seal-${tone}`} className="guest-status-seal" />
        {children}
      </div>
    </div>
  );
}

export function AwaitingApproval({ partySize }: { partySize: number }) {
  return (
    <Banner tone="soft">
      <p className="label">Response received</p>
      <p className="guest-status-title font-display">Thank you</p>
      <p>
        Your response{partySize > 1 ? ` for ${partySize} people` : ""} is with the couple for confirmation. You&rsquo;ll receive the full
        details once your attendance is confirmed.
      </p>
    </Banner>
  );
}

export function Declined() {
  return (
    <Banner tone="soft">
      <p className="label">Response received</p>
      <p className="guest-status-title font-display">Thank you for letting us know</p>
      <p>We&rsquo;ll miss you. If your plans change, you can update your response below before the deadline.</p>
    </Banner>
  );
}

export function Confirmed({ partySize }: { partySize: number }) {
  return (
    <Banner tone="gold">
      <p className="label">Your attendance is confirmed</p>
      <p className="guest-status-title font-display">{partySize === 1 ? "We can't wait to see you" : `Party of ${partySize}`}</p>
      <p>Everything you need for the day is on this page.</p>
      <a href="#pass">View your gate pass <span aria-hidden="true">&nbsp;→</span></a>
    </Banner>
  );
}
