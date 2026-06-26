// test/infer.test.ts
import { describe, it, expect } from 'vitest';
import { inferMachineFromPath } from '../src/infer.js';

const BRANDS = ['Continental', 'Smith-Corona', 'L.C. Smith & Bros', 'Royal'];

describe('inferMachineFromPath', () => {
  it('single-token brand, year, and leftover model', () => {
    expect(inferMachineFromPath('1932-continental-klein', BRANDS)).toEqual({
      brandGuess: 'Continental', modelGuess: 'klein', yearGuess: '1932',
    });
  });
  it('multi-token brand across separators (Smith Corona)', () => {
    expect(inferMachineFromPath('Smith-Corona/1950-Silent', BRANDS)).toEqual({
      brandGuess: 'Smith-Corona', modelGuess: 'Silent', yearGuess: '1950',
    });
  });
  it('punctuation-heavy brand (L.C. Smith & Bros)', () => {
    expect(inferMachineFromPath('L.C. Smith & Bros/No 8', BRANDS)).toEqual({
      brandGuess: 'L.C. Smith & Bros', modelGuess: 'No', yearGuess: '',
    });
  });
  it('no brand match → empty brand, all non-numeric tokens as model', () => {
    expect(inferMachineFromPath('mystery-typewriter', BRANDS)).toEqual({
      brandGuess: '', modelGuess: 'mystery typewriter', yearGuess: '',
    });
  });
  it('decade folder → trailing-X year', () => {
    expect(inferMachineFromPath('Royal/1940s/Quiet De Luxe', BRANDS)).toEqual({
      brandGuess: 'Royal', modelGuess: 'Quiet De Luxe', yearGuess: '194X',
    });
  });
});
