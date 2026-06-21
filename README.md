# twdb-client

A polite, typed Node client for the [Typewriter Database](https://typewriterdatabase.com)
(TWDB) — log in, create/update machines, manage gallery photos and links, and check what
you already have. TypeScript, ESM.

> **Unofficial.** This is not affiliated with the Typewriter Database. It automates the
> normal logged-in web forms on your behalf. It is built to be a **good citizen**: a single
> serialized request queue, a minimum interval between requests, and an honest User-Agent.
> Please don't crank the pacing down or hammer the site — it's a community resource.

## Install

```bash
npm install @joelberger/twdb-client
```

Requires Node 20.9+ (developed on Node 24).

## Quick start

```ts
import { TwdbClient } from '@joelberger/twdb-client';

const twdb = new TwdbClient(); // defaults to https://typewriterdatabase.com
await twdb.login(process.env.TWDB_USERNAME!, process.env.TWDB_PASSWORD!);

// Create a machine (brand/model resolved for you; images resized before upload):
const { id, url } = await twdb.createMachine({
  collection: 'My Collection',
  brand: 'Remington',
  model: 'Portable 2',
  year: '1928',
  serialNo: 'NM89031',
  description: 'A lovely glossy-black portable.',
  coverImage: './photos/remington-cover.jpg',
  typeSampleImage: './photos/remington-typesample.jpg',
});

// Photos:
const { photoId } = await twdb.addPhoto(id, './photos/left-side.jpg', { description: 'Left side' });
await twdb.updatePhoto(id, photoId, { description: 'Left profile' });
const photos = await twdb.listMachinePhotos(id);
await twdb.deletePhoto(id, photoId);

// Links (idempotent — reconciles to exactly this set, matched by URL):
await twdb.setLinks(id, [{ name: 'My write-up', url: 'https://example.com/remington' }]);

// Existence check from the public hunter export (no login needed for this call):
const hunterId = '7773';
const existing = await twdb.findMachine(hunterId, { manufacturer: 'Remington', model: 'Portable 2' });
const all = await twdb.listMyMachines(hunterId);
```

## Sessions

Log in once and persist the session (no password storage):

```ts
const session = twdb.exportSession();          // serializable (cookies only)
// later / elsewhere:
const twdb2 = TwdbClient.fromSession(session); // also defaults to https://typewriterdatabase.com
```

## API

- `new TwdbClient(opts?)` — all options optional; defaults to `https://typewriterdatabase.com`. Pass `baseUrl` only to point at a test server (must be `https` or `localhost`/`127.0.0.1`).
  Options: `{ baseUrl?, userAgent?, minRequestIntervalMs?, retryBackoffMs?, keepAlive? }`
- `login(username, password)`, `exportSession()`, `TwdbClient.fromSession(session, opts?)`
- `createMachine(input)`, `updateMachine(id, input)`
- `addPhoto(galleryId, image, opts?)`, `updatePhoto(galleryId, photoId, opts?)`,
  `deletePhoto(galleryId, photoId)`, `listMachinePhotos(galleryId)`
- `listLinks(galleryId)`, `setLinks(galleryId, [{ name, url }])`
- `listMyMachines(hunterId)`, `findMachine(hunterId, { manufacturer, model, serial? })`
- `listBrands()`, `resolveBrand(name)`, `listModels(brandId)`
- `isValidTwdbYear(year)` — true for a TWDB-format year: a 4-digit year or a trailing-`x` form (`197x`, `19xx`), within the plausible range (~1800 to the current year). `createMachine`/`updateMachine` enforce this and reject otherwise.

Images (`ImageSource` = path | Buffer | stream) are resized to TWDB's limits before upload.
Transient `5xx` responses on reads are retried with a bounded backoff; mutations are not retried.

## Notes

- `findMachine` matches on manufacturer + model (+ serial if given); the serial comparison
  ignores case, spaces, and dashes. `setLinks` matches existing links by URL.
- TWDB's `status` (`My Collection` / `Parting Out` / `Sightings`) is reported verbatim —
  consumers decide how to map it.

## Development

```bash
npm test          # vitest (offline; fixtures + a mock TWDB)
npm run build     # tsc → dist/
```

## License

[MIT](./LICENSE) © Joel Berger
