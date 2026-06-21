// src/validate.ts -- input validators for TWDB conventions.

// The earliest plausible typewriter year. Commercial production started ~1874 (Sholes & Glidden);
// 1800 is a deliberately loose floor that still rejects egregious typos like "1027" or "0500".
const MIN_TWDB_YEAR = 1800;

// TWDB's gallery year ("gallery_name"): a 4-digit year, or known leading digits with trailing
// lowercase `x` for unknown ones (e.g. "197x", "19xx") — per TWDB's upload guidelines, which want
// this exact format so galleries sort correctly. No whitespace, no "1970s"/"ca."/"approx".
//
// Beyond the format, we range-check to catch fat-finger typos: a concrete year must fall within
// [MIN_TWDB_YEAR, current year], and an x-form (which denotes a range, e.g. "18xx" = 1800–1899) is
// accepted when that range overlaps the plausible window. The ceiling is the current year, computed
// at call time, so it never goes stale.
export function isValidTwdbYear(year: string): boolean {
  if (!/^(\d{4}|\d{3}x|\d{2}xx|\dxxx)$/.test(year)) return false;
  const lo = Number(year.replace(/x/g, '0'));
  const hi = Number(year.replace(/x/g, '9'));
  const currentYear = new Date().getFullYear();
  return hi >= MIN_TWDB_YEAR && lo <= currentYear;
}
