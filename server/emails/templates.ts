// Email templates (PROJECT_SPEC §10). Plain functions returning subject, HTML and
// text, so the backend can be tested without a renderer (BLUEPRINT D14). Every
// dynamic value is HTML-escaped: guest names are user input.
// BR-18: only approvalPass, dayBefore and detailsUpdated carry event details, and
// their content comes from getApprovedContent(), which needs proof of approval.

import type { ApprovedContent } from "../services/content";
import { formatDate, formatDateTime, formatTime } from "../utils/dates";

export type Rendered = { subject: string; html: string; text: string };

export type CoupleInfo = { brideName: string; groomName: string; weddingDate: string; monogram: string | null };

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const couple = (c: CoupleInfo) => `${c.brideName} & ${c.groomName}`;

/** Burgundy / gold / ivory shell (PROJECT_SPEC §3). Inline styles: email clients ignore <style>. */
function layout(c: CoupleInfo, body: string, extra = ""): string {
  return `<!doctype html><html><body style="margin:0;background:#FAF6F2;font-family:Georgia,serif;color:#3D0F19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2D7D1">
<tr><td style="background:#3D0F19;color:#C9AB66;text-align:center;padding:28px 16px;font-size:22px;letter-spacing:1px">${esc(couple(c))}<br>
<span style="font-size:13px;color:#E2D7D1;letter-spacing:2px">${esc(formatDate(c.weddingDate).toUpperCase())}</span></td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.6">${body}</td></tr>
<tr><td style="background:#28030A;color:#E2D7D1;text-align:center;padding:14px;font-size:12px">${esc(couple(c))} · Sent to you personally. Please don't forward this email.</td></tr>
</table></td></tr></table>${extra}</body></html>`;
}

/** Gold button with readable wine text (7.4:1 contrast, §3). */
const button = (href: string, label: string) =>
  `<p style="text-align:center;margin:28px 0"><a href="${esc(href)}" style="background:#C9AB66;color:#3D0F19;text-decoration:none;padding:14px 28px;font-family:Arial,sans-serif;font-weight:bold;letter-spacing:1px;display:inline-block">${esc(label)}</a></p>`;

const qrImage = (cid?: string) =>
  cid ? `<p style="text-align:center;margin:8px 0 20px"><img src="cid:${esc(cid)}" width="220" height="220" alt="Your gate pass QR code" style="border:8px solid #FFFFFF;outline:1px solid #E2D7D1"></p>` : "";

const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`;

// --- templates ---

export function invitationEmail(d: { couple: CoupleInfo; firstName: string; link: string; rsvpDeadline: Date; pixelUrl: string }): Rendered {
  const subject = `You're invited: ${couple(d.couple)}`;
  const pixel = `<img src="${esc(d.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0">`;
  const html = layout(
    d.couple,
    p(`Dear ${esc(d.firstName)},`) +
      p(`${esc(couple(d.couple))} warmly invite you to celebrate their wedding.`) +
      button(d.link, "OPEN YOUR INVITATION") +
      p(`Kindly respond by <strong>${esc(formatDateTime(d.rsvpDeadline))}</strong>.`) +
      p(`<span style="font-size:13px;color:#8A5A26">This link is personal to you.</span>`),
    pixel,
  );
  const text = `Dear ${d.firstName},\n\n${couple(d.couple)} warmly invite you to celebrate their wedding.\n\nOpen your invitation: ${d.link}\n\nKindly respond by ${formatDateTime(d.rsvpDeadline)}.\nThis link is personal to you.`;
  return { subject, html, text };
}

/** BR-18: confirms receipt only. No venue, programme or pass. */
export function rsvpReceivedEmail(d: {
  couple: CoupleInfo;
  firstName: string;
  attending: boolean;
  party: string[];
  awaitingApproval: boolean;
  link: string;
}): Rendered {
  const subject = `We received your response: ${couple(d.couple)}`;
  const status = !d.attending
    ? "Thank you for letting us know. We'll miss you."
    : d.awaitingApproval
      ? "Thank you! Your response is with the couple for confirmation. You'll hear from us once it's confirmed."
      : "Thank you! Your updated details have been saved.";
  const partyHtml = d.attending ? p(`<strong>Your party:</strong> ${d.party.map(esc).join(", ")}`) : "";
  const html = layout(d.couple, p(`Dear ${esc(d.firstName)},`) + p(esc(status)) + partyHtml + button(d.link, "VIEW OR CHANGE YOUR RESPONSE"));
  const text = `Dear ${d.firstName},\n\n${status}\n${d.attending ? `\nYour party: ${d.party.join(", ")}\n` : ""}\nView or change your response: ${d.link}`;
  return { subject, html, text };
}

function detailsBlock(content: ApprovedContent): { html: string; text: string } {
  const venues = content.venues
    .map((v) => {
      const dir = v.directionsUrl ? ` · <a href="${esc(v.directionsUrl)}" style="color:#8A5A26">Get directions</a>` : "";
      return `<li><strong>${esc(v.name)}</strong>${v.address ? `, ${esc(v.address)}` : ""}${dir}</li>`;
    })
    .join("");
  const programme = content.programme
    .slice(0, 8)
    .map((i) => `<li>${esc(formatTime(i.startsAt))}: ${esc(i.title)}</li>`)
    .join("");
  const contacts = content.contacts.map((c) => `<li>${esc(c.role)}: ${esc(c.name)}${c.phone ? ` (${esc(c.phone)})` : ""}</li>`).join("");
  const html =
    (venues ? p("<strong>Where</strong>") + `<ul>${venues}</ul>` : "") +
    (programme ? p("<strong>The day</strong>") + `<ul>${programme}</ul>` : "") +
    (content.dressCode ? p(`<strong>Dress code:</strong> ${esc(content.dressCode.text)}`) : "") +
    (contacts ? p("<strong>Contacts</strong>") + `<ul>${contacts}</ul>` : "");
  const text = [
    ...content.venues.map((v) => `Where: ${v.name}${v.address ? `, ${v.address}` : ""}${v.directionsUrl ? ` (directions: ${v.directionsUrl})` : ""}`),
    ...content.programme.slice(0, 8).map((i) => `${formatTime(i.startsAt)}: ${i.title}`),
    content.dressCode ? `Dress code: ${content.dressCode.text}` : "",
    ...content.contacts.map((c) => `${c.role}: ${c.name}${c.phone ? ` (${c.phone})` : ""}`),
  ]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

/** The first message with event details (§10). */
export function approvalPassEmail(d: {
  couple: CoupleInfo;
  firstName: string;
  partySize: number;
  passLink: string;
  pageLink: string;
  gatesOpenAt: Date;
  content: ApprovedContent;
  qrCid?: string;
}): Rendered {
  const subject = `Your attendance is confirmed: ${couple(d.couple)}`;
  const details = detailsBlock(d.content);
  const party = d.partySize === 1 ? "you" : `your party of ${d.partySize}`;
  const html = layout(
    d.couple,
    p(`Dear ${esc(d.firstName)},`) +
      p(`We're delighted to confirm ${esc(party)}. Gates open at <strong>${esc(formatTime(d.gatesOpenAt))}</strong>.`) +
      qrImage(d.qrCid) +
      button(d.passLink, "VIEW YOUR GATE PASS") +
      p(`<span style="font-size:13px;color:#8A5A26">Show the QR code at the gate. Screenshots are fine; your pass is checked live.</span>`) +
      details.html +
      button(d.pageLink, "FULL DETAILS & DIRECTIONS"),
  );
  const text = `Dear ${d.firstName},\n\nWe're delighted to confirm ${party}. Gates open at ${formatTime(d.gatesOpenAt)}.\n\nYour gate pass: ${d.passLink}\nShow the QR code at the gate. Screenshots are fine; your pass is checked live.\n\n${details.text}\n\nFull details and directions: ${d.pageLink}`;
  return { subject, html, text };
}

export function reminderNoResponseEmail(d: { couple: CoupleInfo; firstName: string; link: string; rsvpDeadline: Date }): Rendered {
  const subject = `A gentle reminder to RSVP: ${couple(d.couple)}`;
  const html = layout(
    d.couple,
    p(`Dear ${esc(d.firstName)},`) +
      p(`We'd love to know if you can join us. Please respond by <strong>${esc(formatDateTime(d.rsvpDeadline))}</strong>.`) +
      button(d.link, "RESPOND NOW"),
  );
  const text = `Dear ${d.firstName},\n\nWe'd love to know if you can join us. Please respond by ${formatDateTime(d.rsvpDeadline)}.\n\nRespond: ${d.link}`;
  return { subject, html, text };
}

export function dayBeforeEmail(d: { couple: CoupleInfo; firstName: string; passLink: string; pageLink: string; gatesOpenAt: Date; content: ApprovedContent; qrCid?: string }): Rendered {
  const subject = `See you tomorrow: ${couple(d.couple)}`;
  const details = detailsBlock({ ...d.content, programme: d.content.programme.slice(0, 3) });
  const html = layout(
    d.couple,
    p(`Dear ${esc(d.firstName)},`) +
      p(`We can't wait to celebrate with you tomorrow. Gates open at <strong>${esc(formatTime(d.gatesOpenAt))}</strong>.`) +
      qrImage(d.qrCid) +
      button(d.passLink, "OPEN YOUR GATE PASS") +
      details.html +
      button(d.pageLink, "DAY-OF DETAILS"),
  );
  const text = `Dear ${d.firstName},\n\nWe can't wait to celebrate with you tomorrow. Gates open at ${formatTime(d.gatesOpenAt)}.\n\nYour gate pass: ${d.passLink}\n\n${details.text}\n\nDay-of details: ${d.pageLink}`;
  return { subject, html, text };
}

export function revokedEmail(d: { couple: CoupleInfo; firstName: string }): Rendered {
  const subject = `An update about your invitation: ${couple(d.couple)}`;
  const body = "We're sorry, but your invitation is no longer active. If you think this is a mistake, please contact the couple directly.";
  return { subject, html: layout(d.couple, p(`Dear ${esc(d.firstName)},`) + p(esc(body))), text: `Dear ${d.firstName},\n\n${body}` };
}

/** N5: points to the live page rather than repeating details that may change again (E8). */
export function detailsUpdatedEmail(d: { couple: CoupleInfo; firstName: string; pageLink: string }): Rendered {
  const subject = `Updated wedding details: ${couple(d.couple)}`;
  const body = "Some of the wedding details have changed. Please check the latest programme and directions.";
  return {
    subject,
    html: layout(d.couple, p(`Dear ${esc(d.firstName)},`) + p(esc(body)) + button(d.pageLink, "SEE THE LATEST DETAILS")),
    text: `Dear ${d.firstName},\n\n${body}\n\n${d.pageLink}`,
  };
}
