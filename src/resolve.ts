// src/resolve.ts -- pure, browser-safe helpers for matching/suggesting TWDB field values.

/** Case-insensitive full match against candidates → the canonical candidate, else null. */
export function resolveExact(value: string, candidates: string[]): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return candidates.find((c) => c.toLowerCase() === v) ?? null;
}

/** Best-effort suggestion to pre-highlight in a picker: exact > startsWith > contains (ci); '' if none. */
export function suggestMatch(value: string, candidates: string[]): string {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  return (
    candidates.find((c) => c.toLowerCase() === v) ??
    candidates.find((c) => c.toLowerCase().startsWith(v)) ??
    candidates.find((c) => c.toLowerCase().includes(v)) ??
    ''
  );
}

/** Loose, human-entered year text → a TWDB year (NNNN or trailing-X), or '' if none can be inferred. */
export function suggestTwdbYear(loose: string | null | undefined): string {
  if (!loose) return '';
  const years = new Set<number>();

  const abbr = /(\d{4})\s*[-–—]\s*(\d{1,3})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = abbr.exec(loose)) !== null) {
    const first = Number(m[1]);
    const suffix = m[2];
    const expanded = Number(m[1].slice(0, 4 - suffix.length) + suffix);
    if (expanded > first) {
      years.add(first);
      years.add(expanded);
    }
  }

  for (const g of loose.matchAll(/\d{4}/g)) years.add(Number(g[0]));

  if (years.size === 0) return '';
  if (years.size === 1) {
    const y = [...years][0];
    if (y % 10 === 0 && new RegExp(`\\b${y}s\\b`).test(loose)) return `${Math.floor(y / 10)}X`;
    return String(y);
  }
  return trailingX(String(Math.min(...years)), String(Math.max(...years)));
}

function trailingX(lo: string, hi: string): string {
  let prefix = '';
  for (let i = 0; i < 4; i++) {
    if (lo[i] === hi[i]) prefix += lo[i];
    else break;
  }
  if (prefix.length === 0) return '';
  return prefix.length === 4 ? prefix : prefix + 'X'.repeat(4 - prefix.length);
}
