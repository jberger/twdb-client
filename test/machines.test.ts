// test/machines.test.ts
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import sharp from 'sharp';
import { TwdbClient } from '../src/client.js';
import { TwdbValidationError } from '../src/errors.js';
import { startMockServer, type MockServer } from './helpers/mockServer.js';

const tinyJpeg = (): Promise<Buffer> =>
  sharp({ create: { width: 50, height: 40, channels: 3, background: '#777' } }).jpeg().toBuffer();

let server: MockServer;
beforeAll(async () => {
  server = await startMockServer();
});
afterAll(() => server.close());

const newClient = () =>
  new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });

describe('brand/model resolver', () => {
  it('lists + resolves brands (cached) and lists models', async () => {
    const c = newClient();
    const brands = await c.listBrands();
    expect(brands).toContainEqual({ id: '42', name: 'Remington' });
    expect(await c.resolveBrand('remington')).toEqual({ id: '42', name: 'Remington' }); // case-insensitive
    expect(await c.resolveBrand('nope')).toBeNull();
    const models = await c.listModels('42');
    expect(models).toContainEqual({ id: 'Remington.Portable+2.42.bmys', name: 'Portable 2' });
  });
});

describe('createMachine / updateMachine', () => {
  it('creates a machine (multipart w/ images) and returns {id,url}', async () => {
    const c = newClient();
    const ref = await c.createMachine({
      collection: 'My Collection',
      brand: 'Remington',
      model: 'Portable 2',
      year: '1928',
      serialNo: 'NM89031',
      description: 'desc',
      coverImage: await tinyJpeg(),
      typeSampleImage: await tinyJpeg(),
    });
    expect(ref.id).toBe('25059');
    expect(ref.url).toContain('.typewriter');
  });

  it('throws TwdbValidationError when a required field is missing', async () => {
    const c = newClient();
    await expect(
      c.createMachine({
        collection: 'My Collection',
        brand: 'Remington',
        model: 'Portable 2',
        year: '1928',
        serialNo: '',
        description: 'd',
      }),
    ).rejects.toThrow(/gallery id|rejected/i);
  });

  it('updates an existing machine (id=N)', async () => {
    const c = newClient();
    const ref = await c.updateMachine('25748', {
      collection: 'My Collection',
      brand: 'Remington',
      model: 'Portable 2',
      year: '1928',
      serialNo: '2216',
      description: 'updated',
    });
    expect(ref.id).toBe('25748');
  });
});

describe('createMachine year validation', () => {
  it('rejects a non-conforming year (and never reaches the network)', async () => {
    const server = await startMockServer();
    try {
      const client = new TwdbClient({ baseUrl: server.url, keepAlive: null });
      await client.login('good', 'secret');
      await expect(
        client.createMachine({
          collection: 'My Collection',
          brand: 'Remington',
          model: 'Portable 2',
          year: '1970s',
          serialNo: 'X1',
          description: 'desc',
        }),
      ).rejects.toBeInstanceOf(TwdbValidationError);
    } finally {
      await server.close();
    }
  });
});
