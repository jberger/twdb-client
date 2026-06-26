// test/fuzzy.test.ts
import { describe, it, expect } from 'vitest';
import { levenshtein, similarity, fuzzyBestMatch, inferMake, inferModel } from '../src/fuzzy.js';

describe('levenshtein / similarity', () => {
  it('basic distances and normalized similarity', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('royal', 'royal')).toBe(1);
  });
});

describe('inferMake (fuzzy, order-independent, separator/typo tolerant)', () => {
  const MAKES = ['Continental', 'Smith-Corona', 'Royal', 'L.C. Smith & Bros'];
  it('exact single-token brand anywhere in the path', () => {
    expect(inferMake('1932-continental-klein', MAKES)).toBe('Continental');
    expect(inferMake('Royal/Quiet De Luxe/1948', MAKES)).toBe('Royal');
  });
  it('multi-word brand regardless of the path separators', () => {
    expect(inferMake('Smith Corona/5TE/pictures', MAKES)).toBe('Smith-Corona');
    expect(inferMake('photos/smith_corona_silent', MAKES)).toBe('Smith-Corona');
  });
  it('tolerates a typo', () => {
    expect(inferMake('Smith-Corna 5TE', MAKES)).toBe('Smith-Corona');
  });
  it('returns empty when nothing is close enough', () => {
    expect(inferMake('my cool desk setup', MAKES)).toBe('');
    expect(inferMake('', MAKES)).toBe('');
  });
});

describe('inferModel (against a make’s model list)', () => {
  it('finds the model among the make’s models, ignoring spacing', () => {
    expect(inferModel('Smith Corona/5TE/pictures', ['5TE', 'Silent', 'Sterling'])).toBe('5TE');
    expect(inferModel('Royal Quiet Deluxe 1948', ['Quiet De Luxe', 'Aristocrat'])).toBe('Quiet De Luxe');
  });
  it('returns empty when no model is close', () => {
    expect(inferModel('Royal/pictures', ['Aristocrat', 'Quiet De Luxe'])).toBe('');
  });
});

describe('fuzzyBestMatch returns score + respects threshold', () => {
  it('returns the scored best match, or null below threshold', () => {
    const hit = fuzzyBestMatch('continental', ['Continental', 'Royal']);
    expect(hit?.value).toBe('Continental');
    expect(hit?.score).toBeGreaterThan(0.9);
    expect(fuzzyBestMatch('zzzzz', ['Continental', 'Royal'])).toBeNull();
    expect(fuzzyBestMatch('royal', ['Royal'], { threshold: 1.1 })).toBeNull();
  });
});
