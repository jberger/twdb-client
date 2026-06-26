// test/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { resolveExact, suggestMatch, suggestTwdbYear } from '../src/resolve.js';

describe('resolveExact', () => {
  it('case-insensitive full match → canonical candidate, else null', () => {
    expect(resolveExact('continental', ['Continental', 'Continental (Brother)'])).toBe('Continental');
    expect(resolveExact('  Klein ', ['Klein', 'Klein Conti'])).toBe('Klein');
    expect(resolveExact('contin', ['Continental'])).toBeNull();
    expect(resolveExact('', ['Continental'])).toBeNull();
  });
});

describe('suggestMatch', () => {
  it('exact > startsWith > contains (ci), else empty', () => {
    expect(suggestMatch('continental', ['Adler', 'Continental', 'Continental (Brother)'])).toBe('Continental');
    expect(suggestMatch('contin', ['Adler', 'Continental'])).toBe('Continental');
    expect(suggestMatch('klein', ['Adler', 'Klein-Continental'])).toBe('Klein-Continental');
    expect(suggestMatch('zzz', ['Adler', 'Continental'])).toBe('');
    expect(suggestMatch('', ['Adler', 'Continental'])).toBe('');
  });
});

describe('suggestTwdbYear', () => {
  it('empty / unparseable → empty', () => {
    expect(suggestTwdbYear('')).toBe('');
    expect(suggestTwdbYear(null)).toBe('');
    expect(suggestTwdbYear('no year here')).toBe('');
  });
  it('single concrete year (incl. prose/approx)', () => {
    expect(suggestTwdbYear('1928')).toBe('1928');
    expect(suggestTwdbYear('~1950')).toBe('1950');
    expect(suggestTwdbYear('March 1952')).toBe('1952');
  });
  it('decade notation → trailing X', () => {
    expect(suggestTwdbYear('1940s')).toBe('194X');
  });
  it('full ranges → common-prefix trailing X', () => {
    expect(suggestTwdbYear('1927-1929')).toBe('192X');
    expect(suggestTwdbYear('1940 - 1952')).toBe('19XX');
  });
  it('abbreviated ranges expand forward; year-month does not', () => {
    expect(suggestTwdbYear('1911-12')).toBe('191X');
    expect(suggestTwdbYear('1945 - 6')).toBe('194X');
    expect(suggestTwdbYear('1945-03')).toBe('1945');
  });
  it('no shared leading digit → empty (never malformed XXXX)', () => {
    expect(suggestTwdbYear('1900-2000')).toBe('');
  });
});
