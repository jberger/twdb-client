// test/links.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';

let server: MockServer;
afterEach(() => server?.close());

async function authedClient(): Promise<TwdbClient> {
  server = await startMockServer();
  const client = new TwdbClient({ baseUrl: server.url, keepAlive: null });
  await client.login('good', 'secret');
  return client;
}

describe('listLinks', () => {
  it('lists a gallery\'s weblinks (id, name, url)', async () => {
    const client = await authedClient();
    expect(await client.listLinks('25748')).toEqual([
      { id: '7001', name: 'My blog post', url: 'https://example.com/blog/molle' },
      { id: '7002', name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
    ]);
  });
});
