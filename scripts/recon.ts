// scripts/recon.ts -- usage: TWDB_* env set, then `npm run recon -- <path> <outFile> [--login]`
import { TwdbClient } from '../src/client.js';
import { dumpPage } from '../src/recon.js';

const [path, outFile, ...flags] = process.argv.slice(2);
if (!path || !outFile) {
  console.error('usage: npm run recon -- <path> <fixtures/out.html> [--login]');
  process.exit(1);
}

const baseUrl = process.env.TWDB_BASE_URL ?? 'https://typewriterdatabase.com';
const client = new TwdbClient({ baseUrl }); // default UA + 1s pacing = polite

if (flags.includes('--login')) {
  const u = process.env.TWDB_USERNAME;
  const p = process.env.TWDB_PASSWORD;
  if (!u || !p) { console.error('set TWDB_USERNAME and TWDB_PASSWORD'); process.exit(1); }
  await client.login(u, p);
}

await dumpPage(client, path, outFile);
console.log(`saved ${path} -> ${outFile}`);
