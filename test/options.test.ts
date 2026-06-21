import { describe, it, expect } from 'vitest';
import { TwdbClient } from '../src/client.js';

describe('TwdbClient baseUrl', () => {
  it('constructs with no options (defaults to https TWDB)', () => {
    expect(() => new TwdbClient()).not.toThrow();
  });
  it('allows http for localhost / 127.0.0.1 (test servers)', () => {
    expect(() => new TwdbClient({ baseUrl: 'http://127.0.0.1:8080' })).not.toThrow();
    expect(() => new TwdbClient({ baseUrl: 'http://localhost:8080' })).not.toThrow();
  });
  it('rejects plaintext http for a non-local host (credentials are POSTed)', () => {
    expect(() => new TwdbClient({ baseUrl: 'http://typewriterdatabase.com' })).toThrow();
  });
  it('allows an https remote', () => {
    expect(() => new TwdbClient({ baseUrl: 'https://example.com' })).not.toThrow();
  });
});
