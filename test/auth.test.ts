import { describe, it, expect } from 'vitest';
import { TwdbClient } from '../src/client.js';
import { AuthError } from '../src/errors.js';
import { startMockServer } from './helpers/mockServer.js';

describe('login', () => {
  it('succeeds with valid credentials (resolves, no throw)', async () => {
    const server = await startMockServer();
    try {
      const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
      await expect(client.login('good', 'secret')).resolves.toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it('throws AuthError on bad credentials (failure is detected, not silently passed)', async () => {
    const server = await startMockServer();
    try {
      const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
      await expect(client.login('good', 'wrong')).rejects.toBeInstanceOf(AuthError);
    } finally {
      await server.close();
    }
  });
});
