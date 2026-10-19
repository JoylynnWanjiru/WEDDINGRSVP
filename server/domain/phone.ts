// Phone normalisation to E.164 (BR-20). The normalised value is what BR-21's
// duplicate check compares, so every write path must go through normalizePhone().

/**
 * Kenyan inputs (07…, 01…, 7…, 1…, 254…, +254…, 00254…) become +254XXXXXXXXX.
 * Other international numbers must start with + or 00. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = "+" + digits.slice(2);

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    if (!/^\d+$/.test(rest)) return null;
    if (rest.startsWith("254")) return kenyan(rest.slice(3));
    // E.164: country code + subscriber number, 8–15 digits total.
    return rest.length >= 8 && rest.length <= 15 && !rest.startsWith("0") ? "+" + rest : null;
  }

  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("254")) return kenyan(digits.slice(3));
  if (digits.startsWith("0")) return kenyan(digits.slice(1));
  return kenyan(digits);
}

/** Kenyan mobile numbers: 9 digits after the country code, starting 7 or 1. */
function kenyan(national: string): string | null {
  return /^[71]\d{8}$/.test(national) ? "+254" + national : null;
}
