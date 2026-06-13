// src/recon.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TwdbClient } from './client.js';

/** Fetch `path` through the (polite, identified) client and save the raw HTML to `outFile`. */
export async function dumpPage(client: TwdbClient, path: string, outFile: string): Promise<void> {
  const html = await client.fetchText(path);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html, 'utf8');
}
