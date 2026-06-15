// scripts/recon-machine.ts -- capture a machine's editor pages (one login, polite pacing).
// usage: npm run recon:machine -- <galleryId>   (creds from .env)
import { TwdbClient } from '../src/client.js';
import { dumpPage } from '../src/recon.js';

try {
  process.loadEnvFile();
} catch {
  /* rely on exported env */
}

const id = process.argv[2];
if (!id) {
  console.error('usage: npm run recon:machine -- <galleryId>');
  process.exit(1);
}
const u = process.env.TWDB_USERNAME;
const p = process.env.TWDB_PASSWORD;
if (!u || !p) {
  console.error('set TWDB_USERNAME and TWDB_PASSWORD');
  process.exit(1);
}

const baseUrl = process.env.TWDB_BASE_URL ?? 'https://typewriterdatabase.com';
const client = new TwdbClient({ baseUrl }); // serialized + rate-limited = polite by construction
await client.login(u, p);

// Authenticated full-page captures → fixtures/raw/ (gitignored; may carry account PII).
const targets: [string, string][] = [
  [`typewriter_edit.php?id=${id}`, `fixtures/raw/edit-${id}.html`],
  [`typewriter_editor.php?id=${id}`, `fixtures/raw/editor-desc-${id}.html`],
  [`typewriter_editor_links.php?gallery_id=${id}`, `fixtures/raw/links-${id}.html`],
  [`typewriter_editor_photos.php?gallery_id=${id}`, `fixtures/raw/photos-${id}.html`],
  [`typewriter_editor_photos_ordering.php?gallery_id=${id}`, `fixtures/raw/photos-ordering-${id}.html`],
];

for (const [path, out] of targets) {
  await dumpPage(client, path, out);
  console.log(`saved ${path} -> ${out}`);
}
