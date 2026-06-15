# TWDB Client — Slice 2 (Machines) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create and update TWDB machine galleries from friendly input — resolve brand/model names to
TWDB ids, resize images to TWDB's stored dimensions, and submit the multipart create/edit form.

**Architecture:** Pure helpers (resize, HTML parsing) live in their own modules and are unit-tested
against fixtures; `TwdbClient` gains the orchestrating methods (`listBrands`/`resolveBrand`/
`listModels`, `createMachine`/`updateMachine`) plus internal urlencoded/multipart POST helpers that
route through the existing `#send` pacing. All endpoints/fields are from spec §6 + §16.

**Tech Stack:** TypeScript/Node (ESM), `@mojojs/user-agent` (HTTP + `@mojojs/dom` parsing + `formData`
multipart), `sharp` (resize), `vitest` + the local mock server.

**Endpoints (spec §16):** create `POST typewriter_edit.php` id=0; update same with id=N; brand list =
`cat_id` `<option>`s scraped from the create form; models per brand = `GET mfr.<catId>.model_list`.

---

## File structure

- Create `src/types.ts` — `MachineInput`, `Brand`, `Model`, `MachineRef`, `ImageSource`, `ResizedImage`.
- Create `src/resize.ts` — `resizeForGallery` / `resizeForTypeSample` (sharp), pure.
- Create `src/parse.ts` — pure parsers over a `@mojojs/dom` tree: `parseBrandOptions`,
  `parseModelOptions`, `parseCreateResult`.
- Modify `src/errors.ts` — add `TwdbValidationError`, `UploadTooLargeError`.
- Modify `src/client.ts` — `#postForm`, `#postMultipart`; `listBrands`/`resolveBrand`/`listModels`
  (cached); `createMachine`/`updateMachine`.
- Modify `src/index.ts` — export the new public types + error classes.
- Modify `test/helpers/mockServer.ts` — add `typewriter_edit.php` (GET form + POST), `mfr.*.model_list`.
- Create tests: `test/resize.test.ts`, `test/parse.test.ts`, `test/machines.test.ts`.
- Create fixtures: `fixtures/brand-options.html` (sanitized, ~5 brands), `fixtures/model-list-42.html`,
  `fixtures/create-success.html` (best-effort; confirm on first live create).
- Modify `package.json` — add `sharp` dependency.

---

## Task 1: Types module

**Files:** Create `src/types.ts`; Test: (none — types only, exercised by later tasks).

- [ ] **Step 1: Write the types**

```ts
// src/types.ts
export type ImageSource = string | Buffer; // path or raw bytes

export interface ResizedImage {
  content: Buffer;
  filename: string;
  contentType: string; // e.g. 'image/jpeg'
}

export interface Brand { id: string; name: string; }
export interface Model { id: string; name: string; }

export type Collection = 'My Collection' | 'Parting Out' | 'Sightings';

export interface MachineInput {
  collection: Collection;
  brand: string | Brand;          // resolved to cat_id
  model: string | Model;          // existing Model (id) or a new name (string)
  year: string;                   // TWDB gallery_name
  serialNo: string;
  description: string;            // gallery_desc
  coverImage?: ImageSource;       // resized before upload
  typeSampleImage?: ImageSource;
  watermark?: boolean;            // default true
}

export interface MachineRef { id: string; url: string; }
```

- [ ] **Step 2: Typecheck** — Run `npx tsc --noEmit`. Expected: passes.
- [ ] **Step 3: Commit** — `git add src/types.ts && git commit -m "feat(types): MachineInput + Brand/Model/ResizedImage"`

---

## Task 2: Error types

**Files:** Modify `src/errors.ts`; Test: `test/errors.test.ts`.

- [ ] **Step 1: Add a failing test**

```ts
// append to test/errors.test.ts
import { TwdbError, TwdbValidationError, UploadTooLargeError } from '../src/errors.js';
test('validation + upload errors extend TwdbError', () => {
  expect(new TwdbValidationError('bad', ['serial required'])).toBeInstanceOf(TwdbError);
  expect(new TwdbValidationError('bad', ['x']).problems).toEqual(['x']);
  expect(new UploadTooLargeError('too big')).toBeInstanceOf(TwdbError);
});
```

- [ ] **Step 2: Run** `npx vitest run test/errors.test.ts` — Expected: FAIL (classes undefined).
- [ ] **Step 3: Implement**

```ts
// add to src/errors.ts
export class TwdbValidationError extends TwdbError {
  problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.problems = problems;
  }
}
export class UploadTooLargeError extends TwdbError {}
```

- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(errors): TwdbValidationError + UploadTooLargeError"`

---

## Task 3: Image resizer

**Files:** Create `src/resize.ts`; Test: `test/resize.test.ts`; Modify `package.json` (+sharp).

Spec §8: gallery/cover ≤630px (longest side), type sample ≤550×300. `fit: 'inside'`,
`withoutEnlargement: true` (never upscale; clears the ≤1000px upload gate).

**EXIF orientation (mandatory — DT lesson, spec §8):** the resizer calls sharp's `.rotate()` FIRST to
bake orientation into pixels. TWDB strips metadata, so skipping this publishes sideways images. This
is tested below (the orientation case), and any future transform path (e.g. a crop) must do the same.

- [ ] **Step 1: Add sharp** — `npm install sharp` (it is a real dependency, not dev).
- [ ] **Step 2: Write a failing test** (generate a known oversized image with sharp, resize, assert bounds)

```ts
// test/resize.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { resizeForGallery, resizeForTypeSample } from '../src/resize.js';

async function img(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#888' } }).jpeg().toBuffer();
}
const dims = async (b: Buffer) => { const m = await sharp(b).metadata(); return [m.width!, m.height!]; };

describe('resize', () => {
  it('caps gallery images at 630px on the longest side', async () => {
    const r = await resizeForGallery(await img(2000, 1500), 'photo.jpg');
    const [w, h] = await dims(r.content);
    expect(Math.max(w, h)).toBeLessThanOrEqual(630);
    expect(r.contentType).toBe('image/jpeg');
    expect(r.filename).toBe('photo.jpg');
  });
  it('does not upscale a small image', async () => {
    const [w] = await dims((await resizeForGallery(await img(400, 300), 'x.jpg')).content);
    expect(w).toBe(400);
  });
  it('bakes in rotation AND strips EXIF (uploads must be EXIF-independent)', async () => {
    // 400x200 landscape tagged orientation 6 (=90°) → must come out portrait, pixels baked, tag gone
    const tagged = await sharp(await img(400, 200)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = (await resizeForGallery(tagged, 'r.jpg')).content;
    const meta = await sharp(out).metadata();
    expect(meta.height!).toBeGreaterThan(meta.width!); // .rotate() ran (else stays landscape)
    expect([undefined, 1]).toContain(meta.orientation); // EXIF stripped → no tag to rely on
  });
  it('fits type samples within 550x300', async () => {
    const [w, h] = await dims((await resizeForTypeSample(await img(2000, 2000), 'ts.jpg')).content);
    expect(w).toBeLessThanOrEqual(550); expect(h).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run test/resize.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 4: Implement**

```ts
// src/resize.ts
import sharp from 'sharp';
import { basename } from 'node:path';
import type { ImageSource, ResizedImage } from './types.js';

const toInput = (src: ImageSource) => (typeof src === 'string' ? src : src);
const nameFor = (src: ImageSource, fallback: string) =>
  typeof src === 'string' ? basename(src) : fallback;

async function resizeTo(src: ImageSource, filename: string, w: number, h: number): Promise<ResizedImage> {
  const content = await sharp(toInput(src))
    .rotate() // honor EXIF orientation before resizing
    .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { content, filename: filename.replace(/\.[^.]+$/, '') + '.jpg', contentType: 'image/jpeg' };
}

export function resizeForGallery(src: ImageSource, filename = 'photo.jpg'): Promise<ResizedImage> {
  return resizeTo(src, nameFor(src, filename), 630, 630);
}
export function resizeForTypeSample(src: ImageSource, filename = 'typesample.jpg'): Promise<ResizedImage> {
  return resizeTo(src, nameFor(src, filename), 550, 300);
}
```

- [ ] **Step 5: Run** the test — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(resize): sharp gallery/type-sample resizers (≤630, ≤550×300)"`

---

## Task 4: Recon + fixtures for brands/models

One safe public GET (model list) plus a sanitized brand-options fixture trimmed from the raw capture.

- [ ] **Step 1: Capture the model-list response** (public; Remington cat_id = 42, seen in recon)

Run: `npm run recon -- "mfr.42.model_list" fixtures/raw/model-list-42.html`
Inspect: `head -c 400 fixtures/raw/model-list-42.html` — expect an `<option>` list.

- [ ] **Step 2: Create a small committed model-list fixture** — copy 4–5 `<option>`s into
  `fixtures/model-list-42.html` (public data; safe to commit). Shape:

```html
<option value="">Select a Model</option>
<option value="1234">Portable 2</option>
<option value="1235">Portable 3</option>
<option value="1236">12</option>
```

- [ ] **Step 3: Create a sanitized brand-options fixture** — from `fixtures/raw/edit-25748.html`, copy the
  `<select name="cat_id">` element but keep only ~5 `<option>`s, into `fixtures/brand-options.html`:

```html
<select name="cat_id" id="cat_id">
  <option value="">Select a Brand</option>
  <option value="42">Remington</option>
  <option value="58">Underwood</option>
  <option value="77">Royal</option>
  <option value="90">Molle</option>
</select>
```

- [ ] **Step 4: Commit** — `git add fixtures/model-list-42.html fixtures/brand-options.html && git commit -m "test(fixtures): sanitized brand-options + model-list"`

---

## Task 5: Pure HTML parsers

**Files:** Create `src/parse.ts`; Test: `test/parse.test.ts`. Parse a `@mojojs/dom` tree (so the client
passes `await res.html()` in). Centralizes selectors (spec §11).

- [ ] **Step 1: Failing test** (build a DOM with the UA's parser, assert parsed options)

```ts
// test/parse.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import UserAgent from '@mojojs/user-agent';
import { parseBrandOptions, parseModelOptions } from '../src/parse.js';

const dom = (file: string) => new UserAgent().jsonDom ? null : null; // placeholder; see note
// NOTE: @mojojs/dom is reachable via `@mojojs/dom`'s default export:
import DOM from '@mojojs/dom';
const tree = (file: string) => new DOM(readFileSync(`fixtures/${file}`, 'utf8'));

describe('parse', () => {
  it('parses brand options (skipping the empty placeholder)', () => {
    const brands = parseBrandOptions(tree('brand-options.html'));
    expect(brands).toContainEqual({ id: '42', name: 'Remington' });
    expect(brands.find((b) => b.name === '')).toBeUndefined();
  });
  it('parses model options', () => {
    const models = parseModelOptions(tree('model-list-42.html'));
    expect(models).toContainEqual({ id: '1234', name: 'Portable 2' });
  });
});
```

> Implementer note: confirm the `@mojojs/dom` import/constructor against the installed version (the
> client uses `res.html()` which returns the same tree type — `parse*` must accept that type). Adjust
> the test's tree construction to match; the parser functions take that DOM and return arrays.

- [ ] **Step 2: Run** `npx vitest run test/parse.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
// src/parse.ts
import type { Brand, Model, MachineRef } from './types.js';

// Accept the @mojojs/dom tree (what res.html() returns). Typed loosely to avoid coupling.
type Dom = { find: (sel: string) => Iterable<{ attr: (n: string) => string | null; text: () => string }> };

function options(dom: Dom, selectSel: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const opt of dom.find(`${selectSel} option`)) {
    const id = (opt.attr('value') ?? '').trim();
    const name = opt.text().trim();
    if (id && name) out.push({ id, name }); // skip the empty "Select…" placeholder
  }
  return out;
}

export const parseBrandOptions = (dom: Dom): Brand[] => options(dom, 'select[name="cat_id"]');
export const parseModelOptions = (dom: Dom): Model[] => options(dom, 'select[name="models"], body');

// New gallery id/url from the create response. CONFIRM against a real create (see Task 8 note).
export function parseCreateResult(dom: Dom, finalUrl: string): MachineRef | null {
  const m = finalUrl.match(/(?:^|[./])(\d+)\.typewriter/);
  if (m) return { id: m[1], url: finalUrl };
  for (const a of dom.find('a')) {
    const href = a.attr('href') ?? '';
    const mm = href.match(/(\d+)\.typewriter/);
    if (mm) return { id: mm[1], url: href };
  }
  return null;
}
```

> Note: `parseModelOptions` selector is `select[name="models"], body` because the AJAX `model_list`
> response may be a bare `<option>` list (no wrapping select). Verify against the Task-4 fixture and
> tighten the selector to whatever the real response uses.

- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(parse): brand/model option + create-result parsers"`

---

## Task 6: Brand/model resolver on the client (cached)

**Files:** Modify `src/client.ts`; Test: extend `test/machines.test.ts` (Task 8 sets up the server).

- [ ] **Step 1: Failing test** (add brand-list + model-list routes to the mock — see Task 8 Step 1 —
  then:)

```ts
it('lists + resolves brands (cached) and lists models', async () => {
  const c = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
  const brands = await c.listBrands();
  expect(brands).toContainEqual({ id: '42', name: 'Remington' });
  expect(await c.resolveBrand('remington')).toEqual({ id: '42', name: 'Remington' }); // case-insensitive
  expect(await c.resolveBrand('nope')).toBeNull();
  expect(await c.listModels('42')).toContainEqual({ id: '1234', name: 'Portable 2' });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (on `TwdbClient`)

```ts
#brands?: Brand[];

async listBrands(): Promise<Brand[]> {
  if (!this.#brands) this.#brands = parseBrandOptions(await this.fetchHtml('/typewriter_edit.php?id=0'));
  return this.#brands;
}
async resolveBrand(name: string): Promise<Brand | null> {
  const n = name.trim().toLowerCase();
  return (await this.listBrands()).find((b) => b.name.toLowerCase() === n) ?? null;
}
async listModels(brandId: string): Promise<Model[]> {
  return parseModelOptions(await this.fetchHtml(`/mfr.${brandId}.model_list`));
}
```

(Import `parseBrandOptions`, `parseModelOptions`, and the `Brand`/`Model` types at the top.)

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(client): listBrands/resolveBrand/listModels (cached)"`

---

## Task 7: Internal POST helpers (urlencoded + multipart)

**Files:** Modify `src/client.ts`. Verifies the §15 open item: `formData` with a Buffer file part.

- [ ] **Step 1: Failing test** (mock echoes back what it received; assert file bytes arrive)

```ts
it('submits multipart with a file part', async () => {
  const c = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
  const res = await c.__postMultipartForTest('/echo', {
    fields: { a: '1' },
    files: { photo: { content: Buffer.from('JPEGBYTES'), filename: 'p.jpg', contentType: 'image/jpeg' } },
  });
  expect(res).toContain('a=1');
  expect(res).toContain('photo=p.jpg:JPEGBYTES');
});
```

(Add an `/echo` route to the mock that parses multipart and returns a summary string. Expose a thin
`__postMultipartForTest` that calls the private `#postMultipart` for this test, or test it indirectly
via `createMachine` in Task 8 and delete this scaffold — implementer's choice.)

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
#postForm(path: string, form: Record<string, string>): Promise<NodeResponse> {
  return this.#send(() => this.#ua.post(path, { form }));
}

#postMultipart(
  path: string,
  data: { fields: Record<string, string>; files?: Record<string, ResizedImage> },
): Promise<NodeResponse> {
  const formData: Record<string, unknown> = { ...data.fields };
  for (const [k, f] of Object.entries(data.files ?? {})) {
    formData[k] = { content: f.content, filename: f.filename, type: f.contentType };
  }
  return this.#send(() => this.#ua.post(path, { formData }));
}
```

> Implementer note (§15): confirm `@mojojs/user-agent`'s `formData` accepts `{ content: Buffer,
> filename, type }`. If the key is `contentType`/`mediaType` rather than `type`, adjust here. This is
> the one shape to verify against the installed lib (read its types under `node_modules/@mojojs`).

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(client): internal urlencoded + multipart POST helpers"`

---

## Task 8: createMachine

**Files:** Modify `src/client.ts`, `test/helpers/mockServer.ts`; Create `test/machines.test.ts`.

- [ ] **Step 1: Extend the mock server** — add to `mockServer.ts`:
  - `GET /typewriter_edit.php` (any query) → returns a page containing the `fixtures/brand-options.html`
    select (read the fixture, embed it in a minimal `<form>` with the other fields).
  - `GET /mfr.42.model_list` → returns `fixtures/model-list-42.html`.
  - `POST /typewriter_edit.php` → parse multipart; if `serial_no` present, respond `302` →
    `/1928-remington-portable-2.25059.typewriter`; else return the form again with an error marker.
  - `GET /1928-remington-portable-2.25059.typewriter` → a stub page (so redirect-follow resolves).

- [ ] **Step 2: Failing test**

```ts
// test/machines.test.ts
import { beforeAll, afterAll, it, expect } from 'vitest';
import { TwdbClient } from '../src/client.js';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
let server: MockServer;
beforeAll(async () => { server = await startMockServer(); });
afterAll(() => server.close());

it('creates a machine and returns {id,url}', async () => {
  const c = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
  const ref = await c.createMachine({
    collection: 'My Collection', brand: 'Remington', model: 'Portable 2',
    year: '1928', serialNo: 'NM89031', description: 'desc',
    coverImage: await tinyJpeg(), typeSampleImage: await tinyJpeg(),
  });
  expect(ref.id).toBe('25059');
  expect(ref.url).toContain('.typewriter');
});

it('throws TwdbValidationError when required fields missing', async () => {
  const c = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
  await expect(c.createMachine({
    collection: 'My Collection', brand: 'Remington', model: 'Portable 2',
    year: '1928', serialNo: '', description: 'd',
  })).rejects.toThrow(/required|validation/i);
});
```

(`tinyJpeg()` = a small sharp-generated buffer helper.)

- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** `createMachine` (and a shared private `#submitMachine`)

```ts
async createMachine(input: MachineInput): Promise<MachineRef> {
  return this.#submitMachine('0', input);
}

async #submitMachine(id: string, input: MachineInput): Promise<MachineRef> {
  // resolve brand
  const brand = typeof input.brand === 'string'
    ? (await this.resolveBrand(input.brand)) : input.brand;
  if (!brand) throw new TwdbValidationError(`Unknown brand: ${String(input.brand)}`);

  // resolve model: existing id vs new name
  const fields: Record<string, string> = {
    site_id: '1', gallery_active: '1', id,
    collection: input.collection, cat_id: brand.id,
    gallery_name: input.year, serial_no: input.serialNo, gallery_desc: input.description,
    photo_wm: input.watermark === false ? '0' : '1', submit: '1',
  };
  if (typeof input.model === 'string') {
    const existing = (await this.listModels(brand.id))
      .find((m) => m.name.toLowerCase() === input.model.toString().toLowerCase());
    if (existing) fields.models = existing.id;
    else fields.model = input.model; // new model name
  } else {
    fields.models = input.model.id;
  }

  const files: Record<string, ResizedImage> = {};
  if (input.coverImage) files.photo = await resizeForGallery(input.coverImage);
  if (input.typeSampleImage) files.typesample = await resizeForTypeSample(input.typeSampleImage);

  const res = await this.#postMultipart('/typewriter_edit.php', { fields, files });
  const ref = parseCreateResult(await res.html(), res.url ?? '');
  if (!ref) {
    throw new TwdbValidationError('TWDB did not return a new gallery id (create likely rejected)');
  }
  return ref;
}
```

> **Verify-on-first-live-create (§16):** the create *response* shape (redirect target / where the new
> id appears) is inferred. On the first real `createMachine`, capture the response into
> `fixtures/raw/` and tighten `parseCreateResult` + the validation-failure detection (how TWDB signals
> a rejected form) if needed. Until then `parseCreateResult` keys off a `<id>.typewriter` URL.

- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(client): createMachine (resolve + resize + multipart)"`

---

## Task 9: updateMachine

**Files:** Modify `src/client.ts`; Test: `test/machines.test.ts`.

- [ ] **Step 1: Failing test**

```ts
it('updates an existing machine (id=N)', async () => {
  const c = new TwdbClient({ baseUrl: server.url, keepAlive: null, minRequestIntervalMs: 0 });
  await expect(c.updateMachine('25748', {
    collection: 'My Collection', brand: 'Molle', model: '3',
    year: '1919', serialNo: '2216', description: 'updated',
  })).resolves.toBeTruthy();
});
```

(Mock: `POST /typewriter_edit.php` with `id=25748` → 302 to `/1919-molle-3.25748.typewriter`.)

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
async updateMachine(id: string, input: MachineInput): Promise<MachineRef> {
  return this.#submitMachine(id, input);
}
```

(Partial updates are out of scope for Slice 2 — the caller passes a full `MachineInput`. A
`Partial<MachineInput>` overload that scrapes current values can come later if needed.)

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(client): updateMachine (typewriter_edit.php id=N)"`

---

## Task 10: Public exports + slice review

**Files:** Modify `src/index.ts`.

- [ ] **Step 1: Export the new surface**

```ts
// src/index.ts — add:
export type { MachineInput, Brand, Model, MachineRef, ImageSource, ResizedImage, Collection } from './types.js';
export { TwdbValidationError, UploadTooLargeError } from './errors.js';
export { resizeForGallery, resizeForTypeSample } from './resize.js';
```

- [ ] **Step 2: Full check** — Run `npx tsc --noEmit && npx vitest run`. Expected: all green.
- [ ] **Step 3: Commit** — `git commit -am "feat: export Slice 2 machine API"`
- [ ] **Step 4: Final review** — dispatch a code reviewer over the slice; confirm against spec §5/§6/§16.

---

## Notes / deferred

- **Type-sample aspect:** §16 says type sample stores ≤550×300 — `fit: inside` preserves aspect, so a
  square original becomes ≤300 tall. Confirm TWDB accepts that (it resizes anyway).
- **Validation-failure detection** is best-effort until the first real create (see Task 8 note).
- **Slice 3 (photos)** and **Slice 4 (links + idempotency + adoption)** are separate plans; the
  `findMachine`/`listMyMachines` export parser (§16) and the photo endpoints land there.
