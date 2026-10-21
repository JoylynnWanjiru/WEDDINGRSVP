// Status banners on the personal invitation (spec §4a).

import type { ReactNode } from "react";

function Banner({ tone, children }: { tone: "gold" | "soft"; children: ReactNode }) {
  return (
    <div
      role="status"
      className="guest-status"
      data-tone={tone}
    >
      {children}
    </div>
  );
}

export function AwaitingApproval({ partySize }: { partySize: number }) {
  return (
    <Banner tone="soft">
      <p className="font-display text-2xl text-gold">Thank you</p>
      <p className="mt-2">
        Your response{partySize > 1 ? ` for ${partySize} people` : ""} is with the couple for confirmation. You&rsquo;ll receive the full
        details once your attendance is confirmed.
      </p>
    </Banner>
  );
}

export function Declined() {
  return (
    <Banner tone="soft">
      <p className="font-display text-2xl text-gold">Thank you for letting us know</p>
      <p className="mt-2">We&rsquo;ll miss you. If your plans change, you can update your response below before the deadline.</p>
    </Banner>
  );
}

export function Confirmed({ partySize }: { partySize: number }) {
  return (
    <Banner tone="gold">
      <p className="label text-gold">Your attendance is confirmed</p>
      <p className="mt-2 font-display text-3xl">{partySize === 1 ? "We can't wait to see you" : `Party of ${partySize}`}</p>
      <p className="mt-2 text-sm">Everything you need for the day is on this page.</p>
      <a href="#pass">View your gate pass <span aria-hidden="true">&nbsp;↗</span></a>
    </Banner>
  );
}

/** §6: event details are never hinted at before approval. */
export function DetailsAfterApproval() {
  return (
    <p className="details-after-approval mx-auto max-w-md text-center text-sm">
      The programme, exact location and directions will be shared once your attendance is confirmed.
    </p>
  );
}
