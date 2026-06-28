// src/fuzzy.ts -- pure, dependency-free fuzzy matching of a free-text query (e.g. a folder path)
// against a finite candidate list (TWDB makes, or a make's models).

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Normalized edit-distance similarity in [0, 1] (1 = identical). */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const tokenize = (s: string) => s.split(/[^a-z0-9]+/i).map((t) => t.toLowerCase()).filter(Boolean);

export interface FuzzyMatch {
  value: string;
  score: number;
}

// Score = max of:
//  (a) best similarity of the candidate (joined, normalized) against any contiguous window of
//      path tokens (joined) — tolerant of separators/spacing/typos, position-independent;
//  (b) average over candidate tokens of each token's best similarity to any path token
//      (your "match tokens independently").
export function fuzzyBestMatch(
  query: string,
  candidates: string[],
  opts: { threshold?: number } = {},
): FuzzyMatch | null {
  const threshold = opts.threshold ?? 0.8;
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return null;

  const EPS = 1e-9;
  let best: FuzzyMatch | null = null;
  let bestKeyLen = 0;
  for (const cand of candidates) {
    const cKey = norm(cand);
    if (!cKey) continue;
    const cTokens = tokenize(cand);

    let joined = 0;
    const maxWin = Math.min(qTokens.length, cTokens.length + 1);
    for (let w = 1; w <= maxWin; w++) {
      for (let i = 0; i + w <= qTokens.length; i++) {
        const s = similarity(cKey, qTokens.slice(i, i + w).join(''));
        if (s > joined) joined = s;
      }
    }

    let sum = 0;
    for (const ct of cTokens) {
      let bestTok = 0;
      for (const qt of qTokens) {
        const s = similarity(ct, qt);
        if (s > bestTok) bestTok = s;
      }
      sum += bestTok;
    }
    const coverage = cTokens.length ? sum / cTokens.length : 0;

    const score = Math.max(joined, coverage);
    // Tie-break toward specificity: when candidates match the path equally well, prefer the one that
    // matched MORE of it (longer normalized key) — "Smith Corona" over "Corona", "Deluxe 660TR" over
    // "Deluxe". Safe because a longer candidate only ties when its extra tokens genuinely matched
    // (otherwise its coverage average drops and it scores lower).
    if (!best || score > best.score + EPS || (score > best.score - EPS && cKey.length > bestKeyLen)) {
      best = { value: cand, score };
      bestKeyLen = cKey.length;
    }
  }

  return best && best.score >= threshold ? best : null;
}

export function inferMake(relPath: string, makeNames: string[], threshold = 0.8): string {
  return fuzzyBestMatch(relPath, makeNames, { threshold })?.value ?? '';
}

export function inferModel(relPath: string, modelNames: string[], threshold = 0.8): string {
  return fuzzyBestMatch(relPath, modelNames, { threshold })?.value ?? '';
}
