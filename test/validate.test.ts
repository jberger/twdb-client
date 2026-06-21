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
});
