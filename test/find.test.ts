// test/find.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';

let server: MockServer;
afterEach(() => server?.close());

function client(): TwdbClient {
  return new TwdbClient({ baseUrl: server.url, keepAlive: null });
}

describe('listMyMachines / findMachine', () => {
  it('lists machines from the public export (no login needed)', async () => {
    server = await startMockServer();
    const machines = await client().listMyMachines('7773');
    expect(machines.find((m) => m.id === '25059')?.model).toBe('Portable 2');
  });

  it('findMachine matches on manufacturer + model + serial', async () => {
    server = await startMockServer();
    const m = await client().findMachine('7773', {
      manufacturer: 'remington', model: 'portable 2', serial: 'nm89031',
    });
    expect(m?.id).toBe('25059');
  });

  it('findMachine ignores spaces/dashes in the serial', async () => {
    server = await startMockServer();
    // Fixture serial is 'NM89031'; these spaced/dashed variants should still match.
    for (const serial of ['NM-89031', 'NM 89031', 'nm-890 31']) {
      const m = await client().findMachine('7773', {
        manufacturer: 'Remington', model: 'Portable 2', serial,
      });
      expect(m?.id).toBe('25059');
    }
  });

  it('findMachine returns null when no machine matches', async () => {
    server = await startMockServer();
    const m = await client().findMachine('7773', { manufacturer: 'Nope', model: 'Nope' });
    expect(m).toBeNull();
  });
});
