// test/validate.test.ts
import { describe, it, expect } from 'vitest';
import { isValidTwdbYear } from '../src/validate.js';

describe('isValidTwdbYear', () => {
  it('accepts a 4-digit year and trailing-x decades/centuries', () => {
    for (const y of ['1928', '197x', '19xx', '1xxx']) expect(isValidTwdbYear(y)).toBe(true);
  });
  it('rejects loose/non-conforming years', () => {
    for (const y of ['1970s', 'ca. 1970', 'approx 1970', '197', '19720', 'xxxx', '197X', '', '  1928 '])
      expect(isValidTwdbYear(y)).toBe(false);
  });

  it('rejects implausibly early or future years (typewriters: ~1800 to now)', () => {
    const nextYear = String(new Date().getFullYear() + 1);
    for (const y of ['1799', '0001', '1027', '17xx', '0xxx', nextYear, '2099', '21xx', '203x'])
      expect(isValidTwdbYear(y)).toBe(false);
  });

  it('accepts plausible years up to the current year, incl. overlapping x-ranges', () => {
    const thisYear = String(new Date().getFullYear());
    for (const y of ['1800', '1874', thisYear, '18xx', '19xx', '20xx', '200x', '1xxx', '2xxx'])
      expect(isValidTwdbYear(y)).toBe(true);
  });
});
