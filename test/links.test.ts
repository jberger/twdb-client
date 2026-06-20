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

describe('setLinks', () => {
  it('adds missing links and deletes extras, leaving matches untouched', async () => {
    const client = await authedClient();
    // Current (from fixture): blog (7001), youtube (7002).
    // Desired: keep youtube, add a new wiki link, drop the blog.
    await client.setLinks('25748', [
      { name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
      { name: 'Wiki', url: 'https://example.com/wiki' },
    ]);
    // Added exactly the wiki link:
    expect(server.linkCreates).toHaveLength(1);
    expect(server.linkCreates[0]).toMatchObject({
      sub_app: 'typewriter', sub_id: '25748', link_name: 'Wiki', link_url: 'https://example.com/wiki',
    });
    // Deleted exactly the blog link (id 7001):
    expect(server.linkDeletes).toEqual(['/delete.weblink?id=7001']);
  });
});
