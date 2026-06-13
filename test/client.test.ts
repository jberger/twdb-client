// test/client.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { HttpError } from '../src/errors.js';

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
