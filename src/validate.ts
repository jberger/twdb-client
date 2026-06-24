// src/validate.ts -- input validators for TWDB conventions.

// The earliest plausible typewriter year. Commercial production started ~1874 (Sholes & Glidden);
// 1800 is a deliberately loose floor that still rejects egregious typos like "1027" or "0500".
const MIN_TWDB_YEAR = 1800;

// TWDB's gallery year ("gallery_name"): a 4-digit year, or known leading digits with trailing `x`
// for unknown ones (e.g. "197X", "19XX") — per TWDB's upload form, which shows the format as "192X".
// TWDB's convention is UPPERCASE X; we accept either case here (forgiving input) and the client
// normalizes to uppercase X on submit. No whitespace, no "1970s"/"ca."/"approx".
//
// Beyond the format, we range-check to catch fat-finger typos: a concrete year must fall within
// [MIN_TWDB_YEAR, current year], and an x-form (which denotes a range, e.g. "18XX" = 1800–1899) is
// accepted when that range overlaps the plausible window. The ceiling is the current year, computed
// at call time, so it never goes stale.
export function isValidTwdbYear(year: string): boolean {
  if (!/^(\d{4}|\d{3}x|\d{2}xx|\dxxx)$/i.test(year)) return false;
  const lo = Number(year.replace(/x/gi, '0'));
  const hi = Number(year.replace(/x/gi, '9'));
  const currentYear = new Date().getFullYear();
  return hi >= MIN_TWDB_YEAR && lo <= currentYear;
}
