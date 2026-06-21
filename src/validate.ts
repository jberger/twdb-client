// src/validate.ts -- input validators for TWDB conventions.

// TWDB's gallery year ("gallery_name"): a 4-digit year, or known leading digits with trailing
// lowercase `x` for unknown ones (e.g. "197x", "19xx") — per TWDB's upload guidelines, which want
// this exact format so galleries sort correctly. No whitespace, no "1970s"/"ca."/"approx".
export function isValidTwdbYear(year: string): boolean {
  return /^(\d{4}|\d{3}x|\d{2}xx|\dxxx)$/.test(year);
}
