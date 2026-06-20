# TWDB Client — Slice 4 (links + idempotency + hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the TWDB client: idempotent external-link management (`listLinks`/`setLinks`), remote existence checks (`listMyMachines`/`findMachine`) from the public hunter export, and a bounded retry for transient server errors.

**Architecture:** Same patterns as slices 2–3 — friendly args → TWDB form fields/URLs, selectors isolated in `parse.ts`, methods route through the paced/cookie-jar transport. Links reconcile by URL (list current → add missing → delete extra). Existence checks parse the public TAB-delimited CSV export (no login). Retry wraps GETs only (mutations are not auto-retried).

**Tech Stack:** TypeScript (ESM), vitest, `@mojojs/user-agent` + `@mojojs/dom`.

---

## Recon: DONE — endpoints + markup confirmed (read-only captures + one safeguarded dummy-link write-test on gallery 25748, cleaned up)

- **Links list/edit page:** `GET typewriter_editor_links.php?gallery_id=<gid>`. Each saved link is a
  list item: `<li><a href="<url>" target="_blank"><name> …</a> … <a href="javascript:confirmLinkDelete(<linkId>)">…</a></li>`.
  The link id lives in the `confirmLinkDelete(<id>)` JS call (same idiom as photo delete).
- **Add link:** `POST create.weblink` (urlencoded): `sub_app=typewriter`, `sub_id=<gid>`, `link_name`,
  `link_url`, `submit`.
- **Delete link:** `GET delete.weblink?id=<linkId>`.
- **Existence/list:** public `GET typewriter_list_ajax.php?hunter_search=<hunterId>&output=csv` → TAB-delimited,
  header `id, hunter, status, typesample, serial, year, manufacturer, model, twdb_url, image, images`
  (`images` = photo count). No login. Committed fixture: `fixtures/02-list-7773.csv`. Match key for
  `findMachine`: **manufacturer + model + serial** (serial alone isn't unique).

## Conventions

- Node 24 (default in a fresh shell). Tests: `npm test` (vitest). Type-check: `npx tsc --noEmit`.
- Selectors/parsing live in `src/parse.ts`; tests use `test/helpers/mockServer.ts`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. TDD: failing test first.

## File structure

| File | Responsibility |
|------|----------------|
| `fixtures/links-list.html` (create) | Sanitized links page (tab nav + 2 link rows) for the parser test. |
| `src/types.ts` (modify) | `WebLink`, `RemoteMachine`. |
| `src/parse.ts` (modify) | `parseLinks(html)`, `parseHunterCsv(csv)`. |
| `src/client.ts` (modify) | `listLinks`, `setLinks` (+ private `#addLink`/`#deleteLink`), `listMyMachines`, `findMachine`, GET retry (`#get`) + `retryBackoffMs` option. |
| `src/index.ts` (modify) | Export `WebLink`, `RemoteMachine`. |
| `test/helpers/mockServer.ts` (modify) | weblink routes + capture, CSV export route, flaky route. |
| `test/parse.test.ts` (modify) | `parseLinks`, `parseHunterCsv` tests. |
| `test/links.test.ts` (create) | `listLinks`, `setLinks`. |
| `test/find.test.ts` (create) | `listMyMachines`, `findMachine`. |
| `test/retry.test.ts` (create) | transient-retry behavior. |

---

### Task 1: `WebLink` + `parseLinks` (+ fixture)

**Files:** create `fixtures/links-list.html`; modify `src/types.ts`, `src/parse.ts`, `test/parse.test.ts`.

- [ ] **Step 1: Create `fixtures/links-list.html`** (tab nav must be ignored; two real link rows):

```html
<html><head><title>Typewriter Editor</title></head><body>
<ul class="nav nav-tabs">
  <li><a href="https://typewriterdatabase.com/typewriter_editor.php?id=25748">Description</a></li>
  <li class="active"><a href="#">Links</a></li>
</ul>
<h2>Add and Edit Links for 1919 Molle 3</h2>
<ul style="margin-left:20px;">
  <li><a href="https://example.com/blog/molle" target="_blank">My blog post&nbsp;&nbsp;<img src="/images/icons/link_go.png" /></a>&nbsp;&nbsp;<a href="javascript:confirmLinkDelete(7001)"><img src="/images/icons/cross.png" /></a></li>
  <li><a href="https://youtube.com/watch?v=abc" target="_blank">YouTube&nbsp;&nbsp;<img src="/images/icons/link_go.png" /></a>&nbsp;&nbsp;<a href="javascript:confirmLinkDelete(7002)"><img src="/images/icons/cross.png" /></a></li>
</ul>
<form method="post" action="https://typewriterdatabase.com/create.weblink" id="link_form">
  <input type="hidden" name="sub_app" value="typewriter" />
  <input type="hidden" name="sub_id" value="25748" />
  <input type="text" name="link_name" />
  <input type="text" name="link_url" />
</form>
</body></html>
```

- [ ] **Step 2: Add the `WebLink` type** (append to `src/types.ts`):

```ts
/** An external link on a TWDB machine. `id` is TWDB's weblink id (used for delete). */
export interface WebLink {
  id: string;
  name: string;
  url: string;
}
```

- [ ] **Step 3: Write the failing test** (append to `test/parse.test.ts`; import `parseLinks`):

```ts
describe('parseLinks', () => {
  it('parses saved links (id from confirmLinkDelete, name+url from the anchor), ignoring tab nav', () => {
    const links = parseLinks(readFileSync('fixtures/links-list.html', 'utf8'));
    expect(links).toEqual([
      { id: '7001', name: 'My blog post', url: 'https://example.com/blog/molle' },
      { id: '7002', name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
    ]);
  });
});
```
(`readFileSync` is already imported at the top of `test/parse.test.ts`.)

- [ ] **Step 4: Run `npm test`, confirm it FAILS** (`parseLinks` not exported).

- [ ] **Step 5: Implement** (append to `src/parse.ts`; add `WebLink` to the type import on line 2):

```ts
// Links: each saved link is a list row with a `target="_blank"` anchor (url + name text) followed
// by a `confirmLinkDelete(<id>)` delete control. We parse on the raw HTML because the id and url
// live in sibling anchors (the minimal DomLike can't traverse siblings). The <li>-scoped pattern
// requiring BOTH a target=_blank anchor and a confirmLinkDelete skips the tab-nav <li>s.
export function parseLinks(html: string): WebLink[] {
  const links: WebLink[] = [];
  const re =
    /<li[^>]*>\s*<a\s+href="([^"]+)"\s+target="_blank">([\s\S]*?)<\/a>[\s\S]*?confirmLinkDelete\((\d+)\)/gi;
  for (const m of html.matchAll(re)) {
    const url = m[1];
    const name = m[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    links.push({ id: m[3], name, url });
  }
  return links;
}
```

(Line 2 becomes: `import type { Brand, Model, MachineRef, PhotoRef, WebLink } from './types.js';`)

- [ ] **Step 6: Run `npm test` (parse suite green) + `npx tsc --noEmit` (exit 0).**

- [ ] **Step 7: Commit**

```bash
git add fixtures/links-list.html src/types.ts src/parse.ts test/parse.test.ts
git commit -m "feat(parse): parseLinks + WebLink (id from confirmLinkDelete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: weblink routes + capture in the mock server

**Files:** modify `test/helpers/mockServer.ts`.

- [ ] **Step 1: Extend `MockServer`** with `linkCreates: Record<string, string>[]` and `linkDeletes: string[]`. Initialize both arrays in `startMockServer` and return them (same pattern as `photoCreates`/`photoDeletes`).

- [ ] **Step 2: Add the three routes** before the final `404`:

```ts
    // Links editor page (auth required).
    if (req.method === 'GET' && url.pathname === '/typewriter_editor_links.php') {
      if (!authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(fixture('links-list.html'));
      return;
    }

    // Add weblink (urlencoded). Capture fields, reply OK.
    if (req.method === 'POST' && url.pathname === '/create.weblink') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        linkCreates.push(Object.fromEntries(params.entries()));
        res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Link saved.</body></html>');
      });
      return;
    }

    // Delete weblink: record the URL, reply OK.
    if (req.method === 'GET' && url.pathname === '/delete.weblink') {
      linkDeletes.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Deleted.</body></html>');
      return;
    }
```

- [ ] **Step 3: Verify** existing suite unaffected: `npm test` (all green) + `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add test/helpers/mockServer.ts
git commit -m "test(mock): weblink routes + capture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `listLinks`

**Files:** modify `src/client.ts`; create `test/links.test.ts`.

- [ ] **Step 1: Write the failing test** — create `test/links.test.ts`:

```ts
// test/links.test.ts
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

describe('listLinks', () => {
  it('lists a gallery’s weblinks (id, name, url)', async () => {
    const client = await authedClient();
    expect(await client.listLinks('25748')).toEqual([
      { id: '7001', name: 'My blog post', url: 'https://example.com/blog/molle' },
      { id: '7002', name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
    ]);
  });
});
```

- [ ] **Step 2: Run `npm test`, confirm FAIL** (`listLinks` not a function).

- [ ] **Step 3: Implement** in `src/client.ts`: add `parseLinks` to the `./parse.js` import and `WebLink` to the `./types.js` type import, then:

```ts
  /** List a gallery's external links. */
  async listLinks(galleryId: string): Promise<WebLink[]> {
    return parseLinks(await this.fetchText(`/typewriter_editor_links.php?gallery_id=${galleryId}`));
  }
```

- [ ] **Step 4: Run `npm test` + `npx tsc --noEmit`.**

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/links.test.ts
git commit -m "feat(client): listLinks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `setLinks` (idempotent reconcile)

**Files:** modify `src/client.ts`, `test/links.test.ts`.

- [ ] **Step 1: Write the failing test** (append to `test/links.test.ts`):

```ts
describe('setLinks', () => {
  it('adds missing links and deletes extras, leaving matches untouched', async () => {
    const client = await authedClient();
    // Current (from fixture): blog (7001), youtube (7002).
    // Desired: keep youtube, add a new wiki link, drop the blog.
    await client.setLinks('25748', [
      { name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
      { name: 'Wiki', url: 'https://example.com/wiki' },
    ]);
    // Added exactly the wiki link:
    expect(server.linkCreates).toHaveLength(1);
    expect(server.linkCreates[0]).toMatchObject({
      sub_app: 'typewriter', sub_id: '25748', link_name: 'Wiki', link_url: 'https://example.com/wiki',
    });
    // Deleted exactly the blog link (id 7001):
    expect(server.linkDeletes).toEqual(['/delete.weblink?id=7001']);
  });
});
```

- [ ] **Step 2: Run `npm test`, confirm FAIL** (`setLinks` not a function).

- [ ] **Step 3: Implement** in `src/client.ts` (add private helpers + the public method near `listLinks`):

```ts
  #addLink(galleryId: string, name: string, url: string) {
    return this.#send(() =>
      this.#ua.post('/create.weblink', {
        form: { sub_app: 'typewriter', sub_id: galleryId, link_name: name, link_url: url, submit: '1' },
      }),
    );
  }

  #deleteLink(linkId: string) {
    return this.fetchText(`/delete.weblink?id=${linkId}`);
  }

  /** Reconcile a gallery's links to exactly `links` (matched by URL): add missing, delete extras,
   *  leave matches untouched. Idempotent. */
  async setLinks(galleryId: string, links: { name: string; url: string }[]): Promise<void> {
    const norm = (u: string) => u.trim();
    const current = await this.listLinks(galleryId);
    const currentUrls = new Set(current.map((l) => norm(l.url)));
    const desiredUrls = new Set(links.map((l) => norm(l.url)));
    for (const l of links) {
      if (!currentUrls.has(norm(l.url))) await this.#addLink(galleryId, l.name, l.url);
    }
    for (const c of current) {
      if (!desiredUrls.has(norm(c.url))) await this.#deleteLink(c.id);
    }
  }
```

- [ ] **Step 4: Run `npm test` + `npx tsc --noEmit`.**

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/links.test.ts
git commit -m "feat(client): setLinks (idempotent reconcile by URL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `RemoteMachine` + `parseHunterCsv`

**Files:** modify `src/types.ts`, `src/parse.ts`, `test/parse.test.ts`.

- [ ] **Step 1: Add the type** (append to `src/types.ts`):

```ts
/** A machine as listed in the public hunter export. `status` is reported verbatim
 *  ('My Collection' | 'Parting Out' | 'Sightings'); consumers own the mapping. */
export interface RemoteMachine {
  id: string;
  url: string;
  manufacturer: string;
  model: string;
  serial: string;
  year: string;
  status: string;
  photoCount: number;
}
```

- [ ] **Step 2: Write the failing test** (append to `test/parse.test.ts`; import `parseHunterCsv`):

```ts
describe('parseHunterCsv', () => {
  it('parses the TAB-delimited export by header (order-independent)', () => {
    const machines = parseHunterCsv(readFileSync('fixtures/02-list-7773.csv', 'utf8'));
    expect(machines.length).toBeGreaterThan(0);
    const remington = machines.find((m) => m.id === '25059')!;
    expect(remington).toMatchObject({
      id: '25059',
      manufacturer: 'Remington',
      model: 'Portable 2',
      serial: 'NM89031',
      year: '1928',
      status: 'Sightings',
      photoCount: 7,
      url: 'https://typewriterdatabase.com/1928-remington-portable-2.25059.typewriter',
    });
  });
});
```

- [ ] **Step 3: Run `npm test`, confirm FAIL** (`parseHunterCsv` not exported).

- [ ] **Step 4: Implement** (append to `src/parse.ts`; add `RemoteMachine` to the type import):

```ts
// Hunter export: GET typewriter_list_ajax.php?hunter_search=<id>&output=csv → a TAB-delimited table
// (despite "csv"). Map by header name so column-order drift doesn't break us.
export function parseHunterCsv(csv: string): RemoteMachine[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const cols = lines[0].split('\t');
  const at = (row: string[], name: string) => row[cols.indexOf(name)] ?? '';
  const out: RemoteMachine[] = [];
  for (const line of lines.slice(1)) {
    const r = line.split('\t');
    out.push({
      id: at(r, 'id'),
      url: at(r, 'twdb_url'),
      manufacturer: at(r, 'manufacturer'),
      model: at(r, 'model'),
      serial: at(r, 'serial'),
      year: at(r, 'year'),
      status: at(r, 'status'),
      photoCount: Number(at(r, 'images')) || 0,
    });
  }
  return out;
}
```

(Line 2 type import gains `RemoteMachine`.)

- [ ] **Step 5: Run `npm test` + `npx tsc --noEmit`.**

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/parse.ts test/parse.test.ts
git commit -m "feat(parse): parseHunterCsv + RemoteMachine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `listMyMachines` + `findMachine` (CSV export route)

**Files:** modify `test/helpers/mockServer.ts`, `src/client.ts`; create `test/find.test.ts`.

- [ ] **Step 1: Add the public CSV-export route** to `test/helpers/mockServer.ts` (no auth) before the 404:

```ts
    // Public hunter export (CSV/TAB). No login required.
    if (req.method === 'GET' && url.pathname === '/typewriter_list_ajax.php' && url.searchParams.get('output') === 'csv') {
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end(fixture('02-list-7773.csv'));
      return;
    }
```

- [ ] **Step 2: Write the failing test** — create `test/find.test.ts`:

```ts
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
      manufacturer: 'remington', model: 'portable 2', serial: 'NM89031',
    });
    expect(m?.id).toBe('25059');
  });

  it('findMachine returns null when no machine matches', async () => {
    server = await startMockServer();
    const m = await client().findMachine('7773', { manufacturer: 'Nope', model: 'Nope' });
    expect(m).toBeNull();
  });
});
```

- [ ] **Step 3: Run `npm test`, confirm FAIL** (`listMyMachines` not a function).

- [ ] **Step 4: Implement** in `src/client.ts`: add `parseHunterCsv` to the `./parse.js` import, `RemoteMachine` to the `./types.js` type import, then:

```ts
  /** All of a hunter's machines from the public export (no login required). */
  async listMyMachines(hunterId: string): Promise<RemoteMachine[]> {
    return parseHunterCsv(
      await this.fetchText(`/typewriter_list_ajax.php?hunter_search=${hunterId}&output=csv`),
    );
  }

  /** Find a hunter's machine by manufacturer + model (+ serial if given), case-insensitive. */
  async findMachine(
    hunterId: string,
    criteria: { manufacturer: string; model: string; serial?: string },
  ): Promise<RemoteMachine | null> {
    const norm = (s: string) => s.trim().toLowerCase();
    const machines = await this.listMyMachines(hunterId);
    return (
      machines.find(
        (m) =>
          norm(m.manufacturer) === norm(criteria.manufacturer) &&
          norm(m.model) === norm(criteria.model) &&
          (criteria.serial === undefined || norm(m.serial) === norm(criteria.serial)),
      ) ?? null
    );
  }
```

- [ ] **Step 5: Run `npm test` + `npx tsc --noEmit`.**

- [ ] **Step 6: Commit**

```bash
git add test/helpers/mockServer.ts src/client.ts test/find.test.ts
git commit -m "feat(client): listMyMachines + findMachine (public export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Bounded retry for transient server errors (GET only)

**Files:** modify `src/client.ts`, `test/helpers/mockServer.ts`; create `test/retry.test.ts`.

- [ ] **Step 1: Add a flaky route** to `test/helpers/mockServer.ts`. Near the top of `startMockServer`, add a counter `let flakyHits = 0;`, then a route before the 404:

```ts
    // Flaky: 503 on the first hit, 200 thereafter (for retry tests).
    if (req.method === 'GET' && url.pathname === '/flaky') {
      flakyHits += 1;
      if (flakyHits === 1) { res.writeHead(503); res.end('busy'); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>ok</body></html>');
      return;
    }
    // Always-500 (for exhausted-retry test).
    if (req.method === 'GET' && url.pathname === '/down') { res.writeHead(500); res.end('down'); return; }
```

- [ ] **Step 2: Write the failing test** — create `test/retry.test.ts`:

```ts
// test/retry.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { HttpError } from '../src/errors.js';

let server: MockServer;
afterEach(() => server?.close());

describe('transient retry', () => {
  it('retries a GET that returns 503 and then succeeds', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, retryBackoffMs: 0 });
    const text = await client.fetchText('/flaky');
    expect(text).toContain('ok');
  });

  it('gives up after the retry budget and throws HttpError', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, keepAlive: null, retryBackoffMs: 0 });
    await expect(client.fetchText('/down')).rejects.toBeInstanceOf(HttpError);
  });
});
```

- [ ] **Step 3: Run `npm test`, confirm the first test FAILS** (no retry → `/flaky`'s first 503 throws `HttpError`; also `retryBackoffMs` isn't a known option yet).

- [ ] **Step 4: Implement** in `src/client.ts`:
  (a) Add `retryBackoffMs?: number` to `TwdbClientOptions` (doc: "Backoff between transient-5xx GET retries, ms. Default 250.").
  (b) Add a field + init in the constructor: `#retryBackoffMs: number;` and `this.#retryBackoffMs = opts.retryBackoffMs ?? 250;`.
  (c) Add a private GET-with-retry and route `fetchHtml`/`fetchText` through it:

```ts
  /** GET with a bounded retry on transient 5xx (3 attempts). Mutations are NOT retried. */
  async #get(path: string) {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      const res = await this.#send(() => this.#ua.get(path));
      if (res.statusCode < 500 || attempt >= maxAttempts) return res;
      if (this.#retryBackoffMs > 0) await new Promise((r) => setTimeout(r, this.#retryBackoffMs * attempt));
    }
  }
```
  Then change `fetchHtml` and `fetchText` to use `this.#get(path)` instead of `this.#send(() => this.#ua.get(path))` (keep their existing `res.isSuccess` check + `HttpError` throw, so a final 5xx still throws).

- [ ] **Step 5: Run `npm test` (all green) + `npx tsc --noEmit`.**

- [ ] **Step 6: Commit**

```bash
git add src/client.ts test/helpers/mockServer.ts test/retry.test.ts
git commit -m "feat(client): bounded retry on transient 5xx (GET only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Exports

**Files:** modify `src/index.ts`.

- [ ] **Step 1: Export the new types** — add `WebLink` and `RemoteMachine` to the `export type { … } from './types.js';` block (alphabetical-ish).

- [ ] **Step 2: Full verification** — `npm test` (ALL green) + `npx tsc --noEmit` (exit 0). Confirm exports:
  `grep -E 'WebLink|RemoteMachine' src/index.ts` → both present.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export WebLink + RemoteMachine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- `listLinks`/`setLinks` (idempotent reconcile by URL), `listMyMachines`/`findMachine` (public export,
  match on manufacturer+model+serial), and bounded GET retry — all implemented + unit-tested via the
  mock server; `parseLinks`/`parseHunterCsv` tested against fixtures.
- All vitest suites green; `tsc --noEmit` clean; new types exported.
- This completes the twdb-client library (slices 1–4). Downstream DT→TWDB sync + bulk CLI are
  separate projects with their own specs/plans.

## Deferred (not in this slice)

- **Transparent re-login on session expiry** — detect the login form reappearing mid-session and
  re-authenticate. The session works; this is a robustness nicety for long-lived clients. Note it as
  a follow-up rather than expanding Slice 4.
