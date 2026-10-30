"use client";

// D29: after a public RSVP the device remembers the guest, and this card gives them their personal
// link to keep (copy it, or send it to themselves on WhatsApp), so the pass also opens on another
// phone. "Not you?" makes a shared phone forget them; their link keeps working.

import { useState, useTransition } from "react";
import { forgetDeviceAction } from "@/app/(public)/actions";

export function GuestLinkCard({ link, firstName }: { link: string; firstName: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const message = `My invitation link: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy your link:", link);
    }
  }

  return (
    <div className="guest-link-card">
      <p className="label">Keep your personal link</p>
      <p className="guest-link-text">
        Save it to open your invitation and gate pass on any phone, {firstName}.
      </p>
      <p className="guest-link-url">{link}</p>
      <div className="guest-link-actions">
        <button type="button" className="label" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
        {/* No number: WhatsApp asks which chat, and "Message yourself" keeps it handy. */}
        <a className="label" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          Save to WhatsApp
        </a>
      </div>
      <button
        type="button"
        className="guest-link-forget"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Forget ${firstName} on this device? Your personal link still works.`)) startTransition(() => forgetDeviceAction());
        }}
      >
        Not {firstName}? Forget this device
      </button>
    </div>
  );
}
