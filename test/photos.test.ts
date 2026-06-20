// test/photos.test.ts
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

describe('listMachinePhotos', () => {
  it('lists a gallery\'s photos (photoId + url)', async () => {
    const client = await authedClient();
    const photos = await client.listMachinePhotos('25286');
    expect(photos).toEqual([
      { photoId: '192579', url: 'https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg' },
      { photoId: '192580', url: 'https://typewriterdatabase.com/img/g25286_192580_1744222360.jpg' },
    ]);
  });
});
