// test/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  TwdbError,
  AuthError,
  HttpError,
  ParseError,
  TwdbValidationError,
  UploadTooLargeError,
} from '../src/errors.js';

describe('errors', () => {
  it('AuthError is a TwdbError and an Error with a name', () => {
    const e = new AuthError('bad creds');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TwdbError);
    expect(e.name).toBe('AuthError');
    expect(e.message).toBe('bad creds');
  });

  it('HttpError carries the status code', () => {
    const e = new HttpError('boom', 503);
    expect(e).toBeInstanceOf(TwdbError);
    expect(e.status).toBe(503);
  });

  it('ParseError is a TwdbError', () => {
    expect(new ParseError('no title')).toBeInstanceOf(TwdbError);
  });

  it('TwdbValidationError carries the problems and UploadTooLargeError is a TwdbError', () => {
    const e = new TwdbValidationError('bad', ['serial required']);
    expect(e).toBeInstanceOf(TwdbError);
    expect(e.name).toBe('TwdbValidationError');
    expect(e.problems).toEqual(['serial required']);
    expect(new UploadTooLargeError('too big')).toBeInstanceOf(TwdbError);
  });
});
