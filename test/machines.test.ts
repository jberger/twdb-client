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

  it('lists create-form model names (bare names from models_list)', async () => {
    const c = newClient();
    const names = await c.listCreateModels('42');
    expect(names).toContain('Portable 2');
    expect(names).not.toContain('Entered Next'); // the value="" placeholder is skipped
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
    // url is upgraded from the bare see.<id> form to the canonical <slug>.<id>.typewriter
    expect(ref.url).toBe('https://twdb/1932-test-machine.25059.typewriter');
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
  it('rejects a non-conforming year (fail-fast, before any network call)', async () => {
    const c = newClient();
    await expect(
      c.createMachine({
        collection: 'My Collection',
        brand: 'Remington',
        model: 'Portable 2',
        year: '1970s',
        serialNo: 'X1',
        description: 'desc',
      }),
    ).rejects.toBeInstanceOf(TwdbValidationError);
  });
});

describe('createMachine model field (uses the create-form models_list, not the composite model_list)', () => {
  it('sends an existing model name in the `model` TEXT field (server reads that), and mirrors it in `models`', async () => {
    const c = newClient();
    await c.createMachine({
      collection: 'My Collection',
      brand: 'Remington',
      model: 'Portable 2',
      year: '1928',
      serialNo: 'NM-EXIST',
      description: 'd',
    });
    const sent = server.machineCreates.at(-1)!
    // `model` (text) is the required field TWDB reads — must carry the name, NOT be empty.
    expect(sent.model).toBe('Portable 2')
    // `models` (the picker) mirrors it with the canonical bare name, NOT 'Remington.Portable+2.42.bmys'.
    expect(sent.models).toBe('Portable 2')
  });

  it('sends an unknown model as `model` text with empty `models` (new-model path)', async () => {
    const c = newClient();
    await c.createMachine({
      collection: 'My Collection',
      brand: 'Remington',
      model: 'Totally New Model',
      year: '1928',
      serialNo: 'NM-NEW',
      description: 'd',
    });
    const sent = server.machineCreates.at(-1)!;
    expect(sent.models ?? '').toBe('');
    expect(sent.model).toBe('Totally New Model');
  });

  it('throws TwdbValidationError surfacing the server error when the create is rejected', async () => {
    const c = newClient();
    await expect(
      c.createMachine({
        collection: 'My Collection',
        brand: 'Remington',
        model: 'Portable 2',
        year: '1928',
        serialNo: '', // server rejects → "Required fields were not filled out."
        description: 'd',
      }),
    ).rejects.toThrow(/Required fields were not filled out/i);
  });
});
