// src/infer.ts -- pure path → machine-metadata inference (first-guess for the review screen).
import { suggestTwdbYear } from './resolve.js';

export interface MachineGuess {
  brandGuess: string;
  modelGuess: string;
  yearGuess: string;
}

const SEP = /[/\\\-_.&\s]+/;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isNumericToken = (t: string) => /^\d+$/.test(t) || /^\d*[x]+$/i.test(t) || /^\d{4}s$/i.test(t);

export function inferMachineFromPath(relPath: string, brandNames: string[]): MachineGuess {
  const tokens = relPath.split(SEP).filter(Boolean);

  const brandByKey = new Map<string, string>();
  for (const b of brandNames) {
    const k = norm(b);
    if (k && !brandByKey.has(k)) brandByKey.set(k, b);
  }
  let brandGuess = '';
  const brandIdx = new Set<number>();
  let bestLen = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = tokens.length; j > i; j--) {
      const key = norm(tokens.slice(i, j).join(''));
      const match = brandByKey.get(key);
      if (match && j - i > bestLen) {
        brandGuess = match;
        bestLen = j - i;
        brandIdx.clear();
        for (let k = i; k < j; k++) brandIdx.add(k);
      }
    }
  }

  const modelGuess = tokens
    .filter((t, idx) => !brandIdx.has(idx) && !isNumericToken(t))
    .join(' ');

  return { brandGuess, modelGuess, yearGuess: suggestTwdbYear(relPath) };
}
