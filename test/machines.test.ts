// test/machines.test.ts
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { TwdbClient } from '../src/client.js';
import { startMockServer, type MockServer } from './helpers/mockServer.js';

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
