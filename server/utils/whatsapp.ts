// wa.me click-to-chat links (PROJECT_SPEC §10). Free: the couple sends from their own phone.

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hello {firstName}! 💌\n{brideName} & {groomName} warmly invite you to our wedding on {date}.\n" +
  "Open your personal invitation and RSVP here: {personalLink}\nKindly respond by {rsvpDeadline}.";

/** Replaces {name} placeholders; unknown placeholders are left as they are. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** `phone` must already be E.164 (+254…). */
export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
