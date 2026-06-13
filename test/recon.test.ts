// test/recon.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { dumpPage } from '../src/recon.js';

let server: MockServer;
afterEach(() => server?.close());

describe('dumpPage', () => {
  it('fetches a page and writes its raw HTML to a file', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, minRequestIntervalMs: 0, keepAlive: null });
    const out = join(tmpdir(), `twdb-recon-${Date.now()}.html`);

    await dumpPage(client, '/public', out);

    const html = await readFile(out, 'utf8');
    expect(html).toContain('<title>Public</title>');
    await rm(out, { force: true });
  });
});
