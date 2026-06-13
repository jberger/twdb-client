# twdb-client — Slice 1: Polite Session Core + Recon Tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the polite, authenticated HTTP/session core of the `twdb-client` library — login, authenticated fetch with HTML DOM parsing, request pacing, an honest User-Agent, and a serializable session — plus a small recon script that uses it to capture TWDB pages as fixtures.

**Architecture:** A `TwdbClient` class wraps `@mojojs/user-agent` (tough-cookie jar, HTML DOM via `res.html()`). All requests funnel through one private `#send` method that enforces a minimum inter-request interval (politeness). Tests run against a tiny local `node:http` mock server — no live TWDB traffic. Slice 1's `recon` script is the instrument we later point at TWDB (once) to capture the forms slices 2–4 need.

**Tech Stack:** TypeScript (ESM, NodeNext), `@mojojs/user-agent`, `tough-cookie`, `vitest`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-12-twdb-client-design.md` (§4 architecture, §7 auth, §9 politeness, §14 build order — this is slice 1).

---

## File Structure

```
twdb-client/
  package.json            # ESM lib, scripts, deps
  tsconfig.json           # NodeNext, strict, emits dist/ + .d.ts
  vitest.config.ts        # node env
  .gitignore              # node_modules, dist, .env
  .env.example            # TWDB_BASE_URL / TWDB_USERNAME / TWDB_PASSWORD (recon)
  README.md
  src/
    index.ts              # public exports
    errors.ts             # TwdbError, AuthError, HttpError, ParseError
    client.ts             # TwdbClient (constructor, login, fetchHtml, pacing, session)
    recon.ts              # dumpPage(client, path, outFile) — testable recon helper
  test/
    helpers/mockServer.ts # node:http server emulating login.php + pages
    errors.test.ts
    client.test.ts
    recon.test.ts
  scripts/
    recon.ts              # thin CLI wrapper around src/recon.ts dumpPage
  fixtures/               # captured TWDB HTML (committed test data; populated later)
    .gitkeep
```

**Responsibilities:** `client.ts` owns all network behavior and session state; `errors.ts` is pure error types; `recon.ts` is a thin capture helper; `mockServer.ts` is test-only TWDB emulation.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts` (stub), `fixtures/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@joelberger/twdb-client",
  "version": "0.1.0",
  "description": "A polite, typed client for the Typewriter Database (typewriterdatabase.com)",
  "license": "MIT",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "recon": "tsx scripts/recon.ts"
  },
  "dependencies": {
    "@mojojs/user-agent": "^1.6.0",
    "tough-cookie": "^5.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 4: Create `.gitignore`, `.env.example`, `fixtures/.gitkeep`, `src/index.ts` stub**

`.gitignore`:
```
/node_modules
/dist
.env
*.tsbuildinfo
.DS_Store
```

`.env.example`:
```
# Credentials for the `npm run recon` capture pass (never commit a real .env)
TWDB_BASE_URL=https://typewriterdatabase.com
TWDB_USERNAME=your-username
TWDB_PASSWORD=your-password
```

`fixtures/.gitkeep`: (empty file)

`src/index.ts`:
```ts
export {};
```

- [ ] **Step 5: Create `README.md`**

```markdown
# twdb-client

A polite, typed Node/TypeScript client for the [Typewriter Database](https://typewriterdatabase.com).
Generic and multi-user; resizes images to fit; designed to be a good citizen (honest
User-Agent, gentle pacing). See `docs/superpowers/specs/` for the design.

> Slice 1 (this milestone): authenticated session core + recon tooling.
```

- [ ] **Step 6: Install and verify the toolchain**

Run: `npm install && npx tsc --noEmit && npx vitest run`
Expected: install succeeds; `tsc` clean; vitest reports "No test files found" (exit 0 is fine, or run after first test exists).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold twdb-client (TS/ESM, vitest, mojo.js user-agent)"
```

---

## Task 1: Error types

**Files:**
- Create: `src/errors.ts`
- Test: `test/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/errors.test.ts
import { describe, it, expect } from 'vitest';
import { TwdbError, AuthError, HttpError, ParseError } from '../src/errors.js';

describe('errors', () => {
  it('AuthError is a TwdbError and an Error with a name', () => {
    const e = new AuthError('bad creds');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TwdbError);
    expect(e.name).toBe('AuthError');
    expect(e.message).toBe('bad creds');
  });

  it('HttpError carries the status code', () => {
    const e = new HttpError('boom', 503);
    expect(e).toBeInstanceOf(TwdbError);
    expect(e.status).toBe(503);
  });

  it('ParseError is a TwdbError', () => {
    expect(new ParseError('no title')).toBeInstanceOf(TwdbError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/errors.test.ts`
Expected: FAIL — cannot find module `../src/errors.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/errors.ts
export class TwdbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthError extends TwdbError {}

export class HttpError extends TwdbError {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ParseError extends TwdbError {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "feat: typed error hierarchy (TwdbError/AuthError/HttpError/ParseError)"
```

---

## Task 2: Local mock TWDB server (test helper)

**Files:**
- Create: `test/helpers/mockServer.ts`

This is test-only infrastructure (no separate test for the helper; it's exercised by every client test). It emulates the TWDB behaviors slice 1 cares about: a login POST that sets a session cookie and redirects on success / re-renders the login form on failure, a cookie-gated dashboard, a public page, and a record of received User-Agent headers.

- [ ] **Step 1: Write the mock server**

```ts
// test/helpers/mockServer.ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockServer {
  url: string;
  userAgents: string[]; // UA header seen on each request, in order
  requestTimes: number[]; // ms timestamp of each request
  close: () => Promise<void>;
}

const LOGIN_FORM = `<html><body>
  <form action="login.php" method="post">
    <input name="username"><input type="password" name="passwd">
    <input type="submit" name="commit" value="Sign In">
  </form></body></html>`;

const DASHBOARD = `<html><head><title>Dashboard</title></head><body>Welcome</body></html>`;
const PUBLIC = `<html><head><title>Public</title></head><body>hi</body></html>`;

export async function startMockServer(): Promise<MockServer> {
  const userAgents: string[] = [];
  const requestTimes: number[] = [];

  const server = http.createServer((req, res) => {
    userAgents.push(req.headers['user-agent'] ?? '');
    requestTimes.push(Date.now());
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cookies = req.headers.cookie ?? '';
    const authed = cookies.includes('sid=good');

    if (req.method === 'POST' && url.pathname === '/login.php') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        if (params.get('username') === 'good' && params.get('passwd') === 'secret') {
          res.writeHead(302, { 'set-cookie': 'sid=good; Path=/', location: '/dashboard' });
          res.end();
        } else {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(LOGIN_FORM); // failure: login form is re-rendered
        }
      });
      return;
    }

    if (url.pathname === '/dashboard') {
      if (authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(DASHBOARD); }
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); }
      return;
    }

    if (url.pathname === '/public') {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(PUBLIC); return;
    }

    res.writeHead(404); res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    userAgents,
    requestTimes,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add test/helpers/mockServer.ts
git commit -m "test: local mock TWDB server (login/dashboard/public + UA capture)"
```

---

## Task 3: TwdbClient — constructor, honest User-Agent, `fetchHtml`

**Files:**
- Create: `src/client.ts`
- Test: `test/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/client.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, type MockServer } from './helpers/mockServer.js';
import { TwdbClient } from '../src/client.js';
import { HttpError } from '../src/errors.js';

let server: MockServer;
afterEach(() => server?.close());

describe('TwdbClient.fetchHtml', () => {
  it('fetches a page, parses HTML, and sends the honest User-Agent', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, userAgent: 'twdb-client/test (+repo)' });

    const dom = await client.fetchHtml('/public');

    expect(dom.at('title')?.text()).toBe('Public');
    expect(server.userAgents.at(-1)).toBe('twdb-client/test (+repo)');
  });

  it('throws HttpError on a non-2xx page', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await expect(client.fetchHtml('/missing')).rejects.toBeInstanceOf(HttpError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client.test.ts`
Expected: FAIL — cannot find module `../src/client.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/client.ts
import { UserAgent } from '@mojojs/user-agent';
import { HttpError } from './errors.js';

export interface TwdbClientOptions {
  baseUrl: string;
  userAgent?: string;
  /** Minimum ms between requests (politeness). Default 1000. */
  minRequestIntervalMs?: number;
}

const DEFAULT_UA = 'twdb-client/0.1 (+https://github.com/joelberger/twdb-client)';

export class TwdbClient {
  #ua: UserAgent;

  constructor(opts: TwdbClientOptions) {
    this.#ua = new UserAgent({
      baseURL: opts.baseUrl,
      name: opts.userAgent ?? DEFAULT_UA,
      maxRedirects: 5,
    });
  }

  /** GET `path` and return its parsed HTML DOM (@mojojs/dom). Throws HttpError on non-2xx. */
  async fetchHtml(path: string) {
    const res = await this.#ua.get(path);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.html();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (2 tests). If the `@mojojs/user-agent` import or a method name differs, fix to match the installed package's API, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: TwdbClient.fetchHtml with honest User-Agent + HttpError on non-2xx"
```

---

## Task 4: `login` with success/failure detection

**Files:**
- Modify: `src/client.ts`
- Test: `test/client.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

```ts
// add to test/client.test.ts
import { AuthError } from '../src/errors.js';

describe('TwdbClient.login', () => {
  it('logs in and reuses the session cookie for protected pages', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await client.login('good', 'secret');
    const dom = await client.fetchHtml('/dashboard');
    expect(dom.at('title')?.text()).toBe('Dashboard');
  });

  it('throws AuthError on bad credentials', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url });
    await expect(client.login('good', 'wrong')).rejects.toBeInstanceOf(AuthError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client.test.ts`
Expected: FAIL — `client.login is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/client.ts` (import `AuthError`, add the method):

```ts
import { AuthError, HttpError } from './errors.js';
// ...
  /**
   * Authenticate. Posts the TWDB login form and follows the redirect. Success is
   * detected by the absence of the login form in the resulting page (a re-rendered
   * login form == failure). NOTE: refine this marker against the real login.php
   * response during the slice-1 recon pass.
   */
  async login(username: string, password: string): Promise<void> {
    const res = await this.#ua.post('/login.php', {
      form: { username, passwd: password, commit: 'Sign In' },
    });
    const dom = await res.html();
    if (dom.at('input[name="passwd"]')) {
      throw new AuthError('TWDB login failed (check username/password)');
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: TwdbClient.login (cookie session + form-absence success heuristic)"
```

---

## Task 5: Request pacing (politeness)

**Files:**
- Modify: `src/client.ts`
- Test: `test/client.test.ts` (add case)

- [ ] **Step 1: Write the failing test**

```ts
// add to test/client.test.ts
describe('TwdbClient pacing', () => {
  it('spaces requests by at least minRequestIntervalMs', async () => {
    server = await startMockServer();
    const client = new TwdbClient({ baseUrl: server.url, minRequestIntervalMs: 80 });
    await client.fetchHtml('/public');
    await client.fetchHtml('/public');
    const [t1, t2] = server.requestTimes;
    expect(t2 - t1).toBeGreaterThanOrEqual(70); // ~80ms minus timer slack
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client.test.ts -t pacing`
Expected: FAIL — gap is ~0ms (no pacing yet).

- [ ] **Step 3: Write minimal implementation**

Refactor `src/client.ts` so every request goes through a paced `#send`:

```ts
export class TwdbClient {
  #ua: UserAgent;
  #minInterval: number;
  #lastRequestAt = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(opts: TwdbClientOptions) {
    this.#ua = new UserAgent({
      baseURL: opts.baseUrl,
      name: opts.userAgent ?? DEFAULT_UA,
      maxRedirects: 5,
    });
    this.#minInterval = opts.minRequestIntervalMs ?? 1000;
  }

  /** Serialize requests and enforce the minimum interval between them. */
  #send<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.#lastRequestAt + this.#minInterval - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.#lastRequestAt = Date.now();
      return fn();
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async fetchHtml(path: string) {
    const res = await this.#send(() => this.#ua.get(path));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.html();
  }

  async login(username: string, password: string): Promise<void> {
    const res = await this.#send(() =>
      this.#ua.post('/login.php', { form: { username, passwd: password, commit: 'Sign In' } }),
    );
    const dom = await res.html();
    if (dom.at('input[name="passwd"]')) {
      throw new AuthError('TWDB login failed (check username/password)');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (5 tests). The pacing test passes; earlier tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: serialize + rate-limit all requests (politeness by construction)"
```

---

## Task 6: Serializable session (export/import)

**Files:**
- Modify: `src/client.ts`
- Test: `test/client.test.ts` (add case)

- [ ] **Step 1: Write the failing test**

```ts
// add to test/client.test.ts
describe('TwdbClient session export/import', () => {
  it('restores a logged-in session without logging in again', async () => {
    server = await startMockServer();
    const a = new TwdbClient({ baseUrl: server.url, minRequestIntervalMs: 0 });
    await a.login('good', 'secret');

    const session = a.exportSession();
    const b = TwdbClient.fromSession(session, { baseUrl: server.url, minRequestIntervalMs: 0 });

    const dom = await b.fetchHtml('/dashboard');
    expect(dom.at('title')?.text()).toBe('Dashboard'); // cookie carried over, no login
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client.test.ts -t session`
Expected: FAIL — `a.exportSession is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/client.ts`. The mojo.js jar is a tough-cookie `CookieJar`; serialize via tough-cookie's own sync API, and inject a restored jar through the `cookieJar` option.

```ts
import { CookieJar } from 'tough-cookie';
// ...
export interface SerializedSession {
  cookies: ReturnType<CookieJar['serializeSync']>;
}

export class TwdbClient {
  // ...existing fields...

  /** Export the live cookie jar so a caller can persist the session (no password). */
  exportSession(): SerializedSession {
    return { cookies: this.#ua.cookieJar.serializeSync() };
  }

  /** Rebuild a client from a previously exported session. */
  static fromSession(session: SerializedSession, opts: TwdbClientOptions): TwdbClient {
    const client = new TwdbClient(opts);
    client.#ua.cookieJar = CookieJar.deserializeSync(session.cookies);
    return client;
  }
}
```

(If `#ua.cookieJar` is read-only in the installed version, instead pass the restored jar via `new UserAgent({ ..., cookieJar })` inside `fromSession` — adjust the constructor to accept an optional pre-built jar. Verify against the installed package.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: serializable session (exportSession/fromSession via cookie jar)"
```

---

## Task 7: Recon capture helper + CLI

**Files:**
- Create: `src/recon.ts`
- Create: `scripts/recon.ts`
- Test: `test/recon.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    const client = new TwdbClient({ baseUrl: server.url, minRequestIntervalMs: 0 });
    const out = join(tmpdir(), `twdb-recon-${Date.now()}.html`);

    await dumpPage(client, '/public', out);

    const html = await readFile(out, 'utf8');
    expect(html).toContain('<title>Public</title>');
    await rm(out, { force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/recon.test.ts`
Expected: FAIL — cannot find module `../src/recon.js` (and `dumpPage` / a raw-text fetch don't exist).

- [ ] **Step 3: Write minimal implementation**

First add a raw-text fetch to `src/client.ts` (recon needs the unparsed HTML):

```ts
// in TwdbClient
  /** GET `path` and return the raw response body text. Throws HttpError on non-2xx. */
  async fetchText(path: string): Promise<string> {
    const res = await this.#send(() => this.#ua.get(path));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.text();
  }
```

Then `src/recon.ts`:

```ts
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
```

Then the CLI wrapper `scripts/recon.ts`:

```ts
// scripts/recon.ts — usage: TWDB_* env set, then `npm run recon -- <path> <outFile> [--login]`
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
  const u = process.env.TWDB_USERNAME, p = process.env.TWDB_PASSWORD;
  if (!u || !p) { console.error('set TWDB_USERNAME and TWDB_PASSWORD'); process.exit(1); }
  await client.login(u, p);
}

await dumpPage(client, path, outFile);
console.log(`saved ${path} -> ${outFile}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/recon.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/recon.ts scripts/recon.ts test/recon.test.ts
git commit -m "feat: recon capture helper (dumpPage) + CLI for gentle fixture capture"
```

---

## Task 8: Public exports + green build

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Write the public surface**

```ts
// src/index.ts
export { TwdbClient } from './client.js';
export type { TwdbClientOptions, SerializedSession } from './client.js';
export { TwdbError, AuthError, HttpError, ParseError } from './errors.js';
```

- [ ] **Step 2: Verify the whole build + test suite is green**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` clean; all tests pass (errors: 3, client: 6, recon: 1).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: public exports (TwdbClient + error types)"
```

---

## After slice 1: the gentle recon pass (manual, one session)

Not a coding task — this is how slice 1 unblocks slices 2–4. With a real `.env` (never committed), run the recon CLI a *handful* of times (1s pacing, honest UA) to capture fixtures:

```bash
npm run recon -- /typewriter_editor_links.php?gallery_id=<id> fixtures/links-editor.html --login
npm run recon -- /typewriter_edit.php fixtures/create-form.html --login
# ...the add-photo page, a machine page, the login response, etc.
```

Then read the fixtures to resolve the spec's §15 open items (Links form fields, photo-delete endpoint, login-success marker, exact 1000px rule, how `models` populates) and write the **slice 2** plan against those captured fixtures.

---

## Self-Review

- **Spec coverage (slice 1 scope):** session/HTTP core (Tasks 3–6), honest UA + pacing/politeness §9 (Tasks 3, 5), serializable session §7 (Task 6), HTML DOM parsing §4 (Task 3 via `res.html()`), typed errors §11 (Task 1), `@mojojs/user-agent` decision §4 (Task 0 dep + Task 3 usage), recon-via-library/fixtures §9/§14 (Task 7 + the recon pass). Login-success detection and the other §15 unknowns are explicitly deferred to the post-slice-1 recon pass (by design). Image resize, brand/model, machine/photo ops, idempotency, links = slices 2–4 (out of scope here).
- **Placeholders:** none — every step has runnable code/commands. The two "verify against the installed package" notes (login marker; `cookieJar` assignment) are correctness call-outs for real third-party APIs the TDD loop will confirm, not missing content.
- **Type consistency:** `TwdbClient`, `TwdbClientOptions`, `SerializedSession`, `fetchHtml`, `fetchText`, `login`, `exportSession`, `fromSession`, `#send`, and the error classes are named identically across all tasks and the exports.
