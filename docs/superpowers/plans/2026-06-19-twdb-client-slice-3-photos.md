# TWDB Client — Slice 3 (Photos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gallery-photo management to `TwdbClient` — `listMachinePhotos`, `addPhoto`, `updatePhoto`, `deletePhoto` — against the reverse-engineered TWDB photo endpoints.

**Architecture:** Mirror the Slice 2 machine flow: friendly args → TWDB form fields, multipart upload of resized images via the existing `#postMultipart`, HTML responses parsed by selectors in `parse.ts`. Photos have no content identity; we identify them by TWDB's `gp_id`, which is embedded in every stored image URL (`/img/g<galleryId>_<gp_id>_<ts>.jpg`) and in each per-photo edit form.

**Tech Stack:** TypeScript (ESM), vitest, `@mojojs/user-agent` + `@mojojs/dom`, sharp (resizers already built in Slice 2).

---

## Recon: DONE (2026-06-19) — endpoints + markup confirmed against live TWDB

Captured read-only from galleries 25286/25748, plus one safeguarded add+delete write-test on 25748:

- **List/edit page:** `GET typewriter_editor_photos.php?gallery_id=<gid>`. Each existing photo is a
  `<form action="typewriter_photo_edit.php">` containing `<input name="gp_id" value="<pid>">`,
  `<input name="gallery_id" value="<gid>">`, an `<img src="…/img/g<gid>_<pid>_<ts>.jpg">`, and a
  `<textarea name="photo_desc">`. (The page also has ONE create form,
  `action="typewriter_photo_create.php"`, with an empty `photo_desc` and no `gp_id` — exclude it.)
- **Add:** `POST typewriter_photo_create.php` (multipart): `site_id=1`, `gallery_id`, `photo` (file),
  `photo_desc`, `photo_wm` (1/0), `photo_active` (1/0), `submit=1`. Response (after redirect) is the
  photos page; the new photo has the **numerically-largest `gp_id`** (TWDB `gp_id` is a global
  autoincrement, so the just-added photo is always the max in that gallery).
- **Edit/replace:** `POST typewriter_photo_edit.php` (multipart): `site_id=1`, `gp_id`, `gallery_id`,
  optional `photo` (replace), `photo_desc`, `photo_wm`, `photo_active`, `submit=1`.
- **Delete:** `GET typewriter_photo_delete.php?id=<gid>&gp_id=<pid>` (the page wires this via a JS
  `confirmPhotoDelete(id)` handler; the URL is what matters). Verified: deletes only that `gp_id`.
- **Upload gate:** ≤1000px (handled by `resizeForGallery`, already capping at 630).

Raw captures live in `fixtures/raw/` (gitignored). The one-off `scripts/recon-photo-write.ts` has
served its purpose — delete it as cleanup (see final task).

---

## Conventions

- Node 24 (default in a fresh shell — `node -v` should show v24). Tests: `npm test` (vitest).
  Type-check: `npx tsc --noEmit`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Follow existing patterns: selectors only in `parse.ts`; client methods route through `#send`/
  `#postMultipart`; tests use `test/helpers/mockServer.ts`.

## File structure

| File | Responsibility |
|------|----------------|
| `fixtures/photos-list.html` (create) | Sanitized photos page: 1 create form (to be ignored) + 2 edit forms, for the parser test. |
| `src/types.ts` (modify) | `PhotoRef`, `AddPhotoOptions`, `UpdatePhotoOptions`. |
| `src/parse.ts` (modify) | `parsePhotoList(dom): PhotoRef[]`. |
| `src/client.ts` (modify) | `listMachinePhotos`, `addPhoto`, `updatePhoto`, `deletePhoto`. |
| `src/index.ts` (modify) | Export the new types. |
| `test/helpers/mockServer.ts` (modify) | Photo routes + captured request records. |
| `test/parse.test.ts` (modify) | `parsePhotoList` unit test. |
| `test/photos.test.ts` (create) | Client photo-method tests. |

---

### Task 1: `PhotoRef` + `parsePhotoList` (+ fixture)

**Files:** create `fixtures/photos-list.html`; modify `src/types.ts`, `src/parse.ts`, `test/parse.test.ts`.

- [ ] **Step 1: Create the sanitized fixture** `fixtures/photos-list.html`:

```html
<html><head><title>Typewriter Editor</title></head><body>
<!-- The add form (no gp_id, empty desc) — parser MUST ignore this one. -->
<form method="post" action="typewriter_photo_create.php" enctype="multipart/form-data">
  <input type="hidden" name="site_id" value="1" />
  <input type="hidden" name="gallery_id" value="25286" />
  <textarea name="photo_desc" id="photo_desc"></textarea>
  <input type="file" name="photo" />
</form>
<hr />
<!-- Existing photo #1 -->
<form method="post" action="typewriter_photo_edit.php" id="typewriter_192579" enctype="multipart/form-data">
  <input type="hidden" name="site_id" value="1" />
  <input type="hidden" name="gp_id" value="192579" />
  <input type="hidden" name="gallery_id" value="25286" />
  <input type="file" name="photo" />
  <img src="https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg" class="img-thumbnail" />
  <textarea name="photo_desc">Front view</textarea>
</form>
<!-- Existing photo #2 -->
<form method="post" action="typewriter_photo_edit.php" id="typewriter_192580" enctype="multipart/form-data">
  <input type="hidden" name="site_id" value="1" />
  <input type="hidden" name="gp_id" value="192580" />
  <input type="hidden" name="gallery_id" value="25286" />
  <input type="file" name="photo" />
  <img src="https://typewriterdatabase.com/img/g25286_192580_1744222360.jpg" class="img-thumbnail" />
  <textarea name="photo_desc"></textarea>
</form>
</body></html>
```

- [ ] **Step 2: Add the `PhotoRef` type** — append to `src/types.ts`:

```ts
/** A photo in a TWDB gallery. `photoId` is TWDB's gp_id; `url` is the stored image URL. */
export interface PhotoRef {
  photoId: string;
  url: string;
}
```

- [ ] **Step 3: Write the failing parser test** — append to `test/parse.test.ts`:

```ts
import { parsePhotoList } from '../src/parse.js';

describe('parsePhotoList', () => {
  it('returns photoId + url for each existing photo, ignoring the add form', () => {
    const photos = parsePhotoList(tree('photos-list.html'));
    expect(photos).toEqual([
      { photoId: '192579', url: 'https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg' },
      { photoId: '192580', url: 'https://typewriterdatabase.com/img/g25286_192580_1744222360.jpg' },
    ]);
  });
});
```

- [ ] **Step 4: Run it, verify it fails** — `npm test` → FAIL (`parsePhotoList` not exported).

- [ ] **Step 5: Implement** — append to `src/parse.ts` (add `PhotoRef` to the type import on line 2):

```ts
// Photos: each stored image URL embeds the gp_id (/img/g<gid>_<gp_id>_<ts>.ext). We read the
// gallery's photos straight off those <img> srcs — self-contained identity, no per-form nesting
// needed (and the empty add form has no such <img>, so it's naturally excluded).
export function parsePhotoList(dom: DomLike): PhotoRef[] {
  const photos: PhotoRef[] = [];
  for (const img of dom.find('img')) {
    const src = (img.attr.src ?? '').trim();
    const m = src.match(/\/img\/g\d+_(\d+)_\d+\.\w+/i);
    if (m) photos.push({ photoId: m[1], url: src });
  }
  return photos;
}
```

(Update line 2: `import type { Brand, Model, MachineRef, PhotoRef } from './types.js';`)

- [ ] **Step 6: Run it, verify it passes** — `npm test` (parse suite green) + `npx tsc --noEmit` (exit 0).

- [ ] **Step 7: Commit**

```bash
git add fixtures/photos-list.html src/types.ts src/parse.ts test/parse.test.ts
git commit -m "feat(parse): parsePhotoList + PhotoRef (gp_id from image URLs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Photo routes + request capture in the mock server

**Files:** modify `test/helpers/mockServer.ts`.

- [ ] **Step 1: Extend the `MockServer` interface** — add captured-request arrays. Change the interface to:

```ts
export interface MockServer {
  url: string;
  userAgents: string[];
  requestTimes: number[];
  photoCreates: Record<string, string>[]; // multipart text fields of each create POST
  photoEdits: Record<string, string>[]; // multipart text fields of each edit POST
  photoDeletes: string[]; // request URLs of each delete GET
  close: () => Promise<void>;
}
```

- [ ] **Step 2: Initialize the arrays** — near `const userAgents` / `const requestTimes` at the top of `startMockServer`:

```ts
  const photoCreates: Record<string, string>[] = [];
  const photoEdits: Record<string, string>[] = [];
  const photoDeletes: string[] = [];
```

- [ ] **Step 3: Add a multipart field-collector helper** — beside the existing `mpField`:

```ts
// All text fields of a multipart body, as a map (test-grade).
const mpFields = (body: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
};
```

- [ ] **Step 4: Add the four photo routes** — inside the request handler, before the final `404`:

```ts
    // Gallery photos page (auth required).
    if (req.method === 'GET' && url.pathname === '/typewriter_editor_photos.php') {
      if (!authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(fixture('photos-list.html'));
      return;
    }

    // Add photo: capture fields, reply with a photos page whose newest gp_id (max) is 999999.
    if (req.method === 'POST' && url.pathname === '/typewriter_photo_create.php') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        photoCreates.push(mpFields(body));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>
          <img src="https://typewriterdatabase.com/img/g25286_192579_1.jpg" />
          <img src="https://typewriterdatabase.com/img/g25286_999999_2.jpg" />
        </body></html>`);
      });
      return;
    }

    // Edit photo: capture fields, reply OK.
    if (req.method === 'POST' && url.pathname === '/typewriter_photo_edit.php') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        photoEdits.push(mpFields(body));
        res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Saved.</body></html>');
      });
      return;
    }

    // Delete photo: record the URL, reply OK.
    if (req.method === 'GET' && url.pathname === '/typewriter_photo_delete.php') {
      photoDeletes.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Deleted.</body></html>');
      return;
    }
```

- [ ] **Step 5: Return the new arrays** — in the returned object, add `photoCreates, photoEdits, photoDeletes,` alongside `userAgents`.

- [ ] **Step 6: Verify nothing broke** — `npm test` (existing suites still green) + `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add test/helpers/mockServer.ts
git commit -m "test(mock): photo routes + request capture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `listMachinePhotos`

**Files:** modify `src/client.ts`; create `test/photos.test.ts`.

- [ ] **Step 1: Write the failing test** — create `test/photos.test.ts`:

```ts
// test/photos.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';

let server: MockServer;
afterEach(() => server?.close());

async function authedClient(): Promise<TwdbClient> {
  server = await startMockServer();
  const client = new TwdbClient({ baseUrl: server.url, keepAlive: null });
  await client.login('good', 'secret');
  return client;
}

describe('listMachinePhotos', () => {
  it('lists a gallery’s photos (photoId + url)', async () => {
    const client = await authedClient();
    const photos = await client.listMachinePhotos('25286');
    expect(photos).toEqual([
      { photoId: '192579', url: 'https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg' },
      { photoId: '192580', url: 'https://typewriterdatabase.com/img/g25286_192580_1744222360.jpg' },
    ]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test` → FAIL (`listMachinePhotos` not a function).

- [ ] **Step 3: Implement** — in `src/client.ts`, import the parser + type, then add the method.
  Update imports:
  - line 5: `import { parseBrandOptions, parseModelOptions, parseCreateResult, parsePhotoList } from './parse.js';`
  - line 7: `import type { Brand, Model, MachineInput, MachineRef, ResizedImage, PhotoRef } from './types.js';`

  Add (e.g. after `#submitMachine`):

```ts
  /** List a gallery's photos (ids + stored image URLs). */
  async listMachinePhotos(galleryId: string): Promise<PhotoRef[]> {
    return parsePhotoList(await this.fetchHtml(`/typewriter_editor_photos.php?gallery_id=${galleryId}`));
  }
```

- [ ] **Step 4: Run it, verify it passes** — `npm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/photos.test.ts
git commit -m "feat(client): listMachinePhotos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `addPhoto`

**Files:** modify `src/types.ts`, `src/client.ts`, `test/photos.test.ts`.

- [ ] **Step 1: Add the options type** — append to `src/types.ts`:

```ts
/** Options for adding a photo. Defaults: watermark on, published. */
export interface AddPhotoOptions {
  description?: string;
  watermark?: boolean;
  publish?: boolean;
}
```

- [ ] **Step 2: Write the failing test** — append to `test/photos.test.ts`:

```ts
import { TwdbValidationError } from '../src/errors.js';

describe('addPhoto', () => {
  it('uploads a photo and returns the new gp_id (max in the response)', async () => {
    const client = await authedClient();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ); // 1x1 png
    const { photoId } = await client.addPhoto('25286', png, { description: 'Side view' });
    expect(photoId).toBe('999999');
    const fields = server.photoCreates.at(-1)!;
    expect(fields.gallery_id).toBe('25286');
    expect(fields.photo_desc).toBe('Side view');
    expect(fields.photo_wm).toBe('1');
    expect(fields.photo_active).toBe('1');
  });
});
```

- [ ] **Step 3: Run it, verify it fails** — `npm test` → FAIL (`addPhoto` not a function).

- [ ] **Step 4: Implement** — in `src/client.ts`, add `AddPhotoOptions` **and** `ImageSource` to the type import on line 7, then add:

```ts
  /** Add a photo to a gallery. Resizes, uploads, and returns the new TWDB photo id. */
  async addPhoto(
    galleryId: string,
    image: ImageSource,
    opts: AddPhotoOptions = {},
  ): Promise<{ photoId: string }> {
    const fields: Record<string, string> = {
      site_id: '1',
      gallery_id: galleryId,
      photo_desc: opts.description ?? '',
      photo_wm: opts.watermark === false ? '0' : '1',
      photo_active: opts.publish === false ? '0' : '1',
      submit: '1',
    };
    const files = { photo: await resizeForGallery(image) };
    const res = await this.#postMultipart('/typewriter_photo_create.php', { fields, files });
    const photos = parsePhotoList(await res.html());
    if (photos.length === 0) {
      throw new TwdbValidationError('TWDB did not return a photo id (the upload was likely rejected)');
    }
    // gp_id is a global autoincrement → the just-added photo is the numerically largest.
    const newest = photos.reduce((a, b) => (Number(b.photoId) > Number(a.photoId) ? b : a));
    return { photoId: newest.photoId };
  }
```

Also add `TwdbValidationError` is already imported in client.ts (line 4) — confirm it's in the import; it is.

- [ ] **Step 5: Run it, verify it passes** — `npm test` + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/client.ts test/photos.test.ts
git commit -m "feat(client): addPhoto (resize + upload, returns new gp_id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `updatePhoto`

**Files:** modify `src/types.ts`, `src/client.ts`, `test/photos.test.ts`.

- [ ] **Step 1: Add the options type** — append to `src/types.ts`:

```ts
/** Options for editing a photo. NOTE: this submits photo_desc/watermark/published each call
 *  (the TWDB edit form is not a partial update) — pass `description` to avoid clearing it.
 *  Defaults preserve watermark + published. Provide `image` to replace the photo bytes. */
export interface UpdatePhotoOptions {
  description?: string;
  watermark?: boolean;
  publish?: boolean;
  image?: ImageSource;
}
```

- [ ] **Step 2: Write the failing test** — append to `test/photos.test.ts`:

```ts
describe('updatePhoto', () => {
  it('posts the gp_id + fields to the edit endpoint', async () => {
    const client = await authedClient();
    await client.updatePhoto('25286', '192579', { description: 'Updated caption', publish: false });
    const fields = server.photoEdits.at(-1)!;
    expect(fields.gp_id).toBe('192579');
    expect(fields.gallery_id).toBe('25286');
    expect(fields.photo_desc).toBe('Updated caption');
    expect(fields.photo_active).toBe('0');
    expect(fields.photo_wm).toBe('1');
  });
});
```

- [ ] **Step 3: Run it, verify it fails** — `npm test` → FAIL.

- [ ] **Step 4: Implement** — in `src/client.ts`, add `UpdatePhotoOptions` to the type import (line 7) and add:

```ts
  /** Edit a photo's description / flags, optionally replacing its image. See UpdatePhotoOptions. */
  async updatePhoto(galleryId: string, photoId: string, opts: UpdatePhotoOptions = {}): Promise<void> {
    const fields: Record<string, string> = {
      site_id: '1',
      gp_id: photoId,
      gallery_id: galleryId,
      photo_desc: opts.description ?? '',
      photo_wm: opts.watermark === false ? '0' : '1',
      photo_active: opts.publish === false ? '0' : '1',
      submit: '1',
    };
    const files = opts.image ? { photo: await resizeForGallery(opts.image) } : undefined;
    await this.#postMultipart('/typewriter_photo_edit.php', { fields, files });
  }
```

- [ ] **Step 5: Run it, verify it passes** — `npm test` + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/client.ts test/photos.test.ts
git commit -m "feat(client): updatePhoto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `deletePhoto`

**Files:** modify `src/client.ts`, `test/photos.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `test/photos.test.ts`:

```ts
describe('deletePhoto', () => {
  it('GETs the delete endpoint with id + gp_id', async () => {
    const client = await authedClient();
    await client.deletePhoto('25286', '192579');
    expect(server.photoDeletes.at(-1)).toBe('/typewriter_photo_delete.php?id=25286&gp_id=192579');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — add to `src/client.ts`:

```ts
  /** Delete a photo from a gallery (TWDB's delete is a GET). */
  async deletePhoto(galleryId: string, photoId: string): Promise<void> {
    await this.fetchText(`/typewriter_photo_delete.php?id=${galleryId}&gp_id=${photoId}`);
  }
```

- [ ] **Step 4: Run it, verify it passes** — `npm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/photos.test.ts
git commit -m "feat(client): deletePhoto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Exports + cleanup

**Files:** modify `src/index.ts`; delete `scripts/recon-photo-write.ts`.

- [ ] **Step 1: Export the new types** — in `src/index.ts`, add `PhotoRef`, `AddPhotoOptions`, `UpdatePhotoOptions` to the `export type { … } from './types.js';` block.

- [ ] **Step 2: Remove the one-off write-recon script** (it was a one-time capture; the real add/delete now live in the client):

```bash
git rm scripts/recon-photo-write.ts
```

- [ ] **Step 3: Full verification** — `npm test` (all suites green) + `npx tsc --noEmit` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export photo types; drop one-off write-recon script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- `listMachinePhotos` / `addPhoto` / `updatePhoto` / `deletePhoto` implemented + unit-tested against
  the mock server; `parsePhotoList` tested against a sanitized fixture.
- All vitest suites green; `tsc --noEmit` clean; new types exported.
- (Optional, separate) a live smoke-test against TWDB using the safeguarded add→delete-the-dummy
  pattern, if you want end-to-end confidence before Slice 4 (links + idempotency + adoption).
