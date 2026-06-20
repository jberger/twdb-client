// test/retry.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { HttpError } from '../src/errors.js';

let server: MockServer;
afterEach(() => server?.close());

describe('transient retry', () => {
  it('retries a GET that returns 503 and then succeeds', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, retryBackoffMs: 0, minRequestIntervalMs: 0 });
    const text = await client.fetchText('/flaky');
    expect(text).toContain('ok');
  });

  it('gives up after the retry budget and throws HttpError', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, retryBackoffMs: 0, minRequestIntervalMs: 0 });
    await expect(client.fetchText('/down')).rejects.toBeInstanceOf(HttpError);
  });
});
