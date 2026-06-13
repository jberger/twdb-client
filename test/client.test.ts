// test/client.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { HttpError, AuthError } from '../src/errors.js';

let server: MockServer;
afterEach(() => server?.close());

describe('TwdbClient.fetchHtml', () => {
  it('fetches a page, parses HTML, and sends the honest User-Agent', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, userAgent: 'twdb-client/test (+repo)' });

    const dom = await client.fetchHtml('/public');

    expect(dom.at('title')?.text()).toBe('Public');
    expect(server.userAgents.at(-1)).toBe('twdb-client/test (+repo)');
  });

  it('throws HttpError on a non-2xx page', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await expect(client.fetchHtml('/missing')).rejects.toBeInstanceOf(HttpError);
  });
});

describe('TwdbClient.login', () => {
  it('logs in and reuses the session cookie for protected pages', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await client.login('good', 'secret');
    const dom = await client.fetchHtml('/dashboard');
    expect(dom.at('title')?.text()).toBe('Dashboard');
  });

  it('throws AuthError on bad credentials', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await expect(client.login('good', 'wrong')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('TwdbClient pacing', () => {
  it('spaces requests by at least minRequestIntervalMs', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, minRequestIntervalMs: 80 });
    await client.fetchHtml('/public');
    await client.fetchHtml('/public');
    const [t1, t2] = server.requestTimes;
    expect(t2 - t1).toBeGreaterThanOrEqual(70); // ~80ms minus timer slack
  });
});
