// test/photos.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import sharp from 'sharp';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { TwdbValidationError } from '../src/errors.js';

const tinyPng = (): Promise<Buffer> =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: '#aaa' } }).png().toBuffer();

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

describe('addPhoto', () => {
  it('uploads a photo and returns the new gp_id (max in the response)', async () => {
    const client = await authedClient();
    const png = await tinyPng();
    const { photoId } = await client.addPhoto('25286', png, { description: 'Side view' });
    expect(photoId).toBe('999999');
    const fields = server.photoCreates.at(-1)!;
    expect(fields.gallery_id).toBe('25286');
    expect(fields.photo_desc).toBe('Side view');
    expect(fields.photo_wm).toBe('1');
    expect(fields.photo_active).toBe('1');
  });
});
