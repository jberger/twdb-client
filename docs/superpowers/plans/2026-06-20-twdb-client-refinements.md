# twdb-client Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three refinements to the published twdb-client, surfaced while integrating it into Dynamically Typed: TWDB-conformant **year validation**, a safer **`baseUrl`** (optional, defaults to the one real TWDB, https-enforced), and a **`prepare`** script so the library is consumable as a GitHub dependency.

**Architecture:** Small, additive changes to the existing library. A new pure validator (`isValidTwdbYear`) enforced in `#submitMachine`; constructor defaults + validates `baseUrl`; a `prepare` build hook so `npm install github:jberger/twdb-client` produces `dist/`.

**Tech Stack:** TypeScript (ESM), vitest.

---

## Background (decisions, from the DT-integration discussion + TWDB's official guidelines)

- **Year format:** TWDB wants `NNNN` or trailing-`x` for unknown digits (`"197x"`, not `"1970's???"`/`"ca. 1970"`). The library should **hard-reject** a non-conforming year with `TwdbValidationError` (normalization stays in the consumer). Confirmed by TWDB's "Guidelines for uploading Galleries."
- **`baseUrl`:** there's only one non-test TWDB, and credentials are POSTed — so `baseUrl` shouldn't be env-plumbed and shouldn't allow plaintext http. Make it **optional, default `https://typewriterdatabase.com`**, and **reject non-https** unless the host is `localhost`/`127.0.0.1` (so the http mock-server tests still work).
- **Retry on 5xx:** unchanged — it's GET-only (no write amplification) and acceptable with backoff.
- **`prepare` script:** DT consumes the library as `github:jberger/twdb-client`; its `exports` point at `dist/`, which a git install won't build without a `prepare` hook.

## Conventions

- Node 24 default. Tests: `npm test` (vitest). Type-check: `npx tsc --noEmit`. TDD (failing test first).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File structure

| File | Responsibility |
|------|----------------|
| `src/validate.ts` (create) | `isValidTwdbYear(year)` — pure TWDB year-format check. |
| `src/client.ts` (modify) | enforce year in `#submitMachine`; `baseUrl` optional+default+https-guard in the constructor. |
| `src/index.ts` (modify) | export `isValidTwdbYear`. |
| `package.json` (modify) | `prepare` script + version bump. |
| `README.md` (modify) | quick-start uses the default `baseUrl`. |
| `test/validate.test.ts` (create) | `isValidTwdbYear` cases. |
| `test/options.test.ts` (create) | constructor baseUrl default + https guard. |
| `test/machines.test.ts` (modify) | `createMachine` rejects a bad year before any network call. |

---

### Task 1: `isValidTwdbYear` validator

**Files:** create `src/validate.ts`, `test/validate.test.ts`; modify `src/index.ts`.

- [ ] **Step 1: Write the failing test** — create `test/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidTwdbYear } from '../src/validate.js';

describe('isValidTwdbYear', () => {
  it('accepts a 4-digit year and trailing-x decades/centuries', () => {
    for (const y of ['1928', '197x', '19xx', '1xxx']) expect(isValidTwdbYear(y)).toBe(true);
  });
  it('rejects loose/non-conforming years', () => {
    for (const y of ['1970s', 'ca. 1970', 'approx 1970', '197', '19720', 'xxxx', '197X', '', '  1928 '])
      expect(isValidTwdbYear(y)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npm test` → `isValidTwdbYear` not exported.

- [ ] **Step 3: Implement** — create `src/validate.ts`:

```ts
// src/validate.ts -- input validators for TWDB conventions.

// TWDB's gallery year ("gallery_name"): a 4-digit year, or known leading digits with trailing
// lowercase `x` for unknown ones (e.g. "197x", "19xx") — per TWDB's upload guidelines, which want
// this exact format so galleries sort correctly. No whitespace, no "1970s"/"ca."/"approx".
export function isValidTwdbYear(year: string): boolean {
  return /^(\d{4}|\d{3}x|\d{2}xx|\dxxx)$/.test(year);
}
```

- [ ] **Step 4: Run it, verify PASS** — `npm test` + `npx tsc --noEmit` (exit 0).

- [ ] **Step 5: Export it** — add `isValidTwdbYear` to `src/index.ts` (a `export { isValidTwdbYear } from './validate.js';` line near the other value exports).

- [ ] **Step 6: Commit**

```bash
git add src/validate.ts test/validate.test.ts src/index.ts
git commit -m "feat(validate): isValidTwdbYear (NNNN or trailing-x)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Enforce the year in `#submitMachine`

**Files:** modify `src/client.ts`, `test/machines.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `test/machines.test.ts`. Use the mock server (so the TDD *red* run, which has no validation yet, hits the mock and NOT the real TWDB). Match the existing machines-test setup (`startMockServer`, `afterEach` close, `TwdbValidationError` import from `../src/errors.js`):

```ts
describe('createMachine year validation', () => {
  it('rejects a non-conforming year (and never reaches the network)', async () => {
    const server = await startMockServer();
    try {
      const client = new TwdbClient({ baseUrl: server.url, keepAlive: null });
      await client.login('good', 'secret');
      await expect(
        client.createMachine({
          collection: 'My Collection',
          brand: 'Remington',
          model: 'Portable 2',
          year: '1970s',
          serialNo: 'X1',
          description: 'desc',
        }),
      ).rejects.toBeInstanceOf(TwdbValidationError);
    } finally {
      await server.close();
    }
  });
});
```
(Check how `machines.test.ts` already imports `startMockServer`/`TwdbClient` and reuse those imports; add `TwdbValidationError` if missing.)

- [ ] **Step 2: Run it, verify FAIL** — `npm test`. Red: with no validation yet, `createMachine` resolves the brand from the mock and POSTs the bad year to the mock's create route, which returns a saved gallery — so it resolves instead of rejecting → the `rejects.toBeInstanceOf(TwdbValidationError)` assertion fails. (Offline — it hit the mock, not real TWDB.)

- [ ] **Step 3: Implement** — in `src/client.ts`: import the validator (`import { isValidTwdbYear } from './validate.js';`), and add the check at the very TOP of `#submitMachine` (before brand resolution, so it fails fast with no network):

```ts
  async #submitMachine(id: string, input: MachineInput): Promise<MachineRef> {
    if (!isValidTwdbYear(input.year)) {
      throw new TwdbValidationError(
        `Invalid TWDB year "${input.year}" — use a 4-digit year or trailing x (e.g. 1928 or 197x)`,
      );
    }
    const brand = typeof input.brand === 'string' ? await this.resolveBrand(input.brand) : input.brand;
    // ...rest unchanged...
```

- [ ] **Step 4: Run it, verify PASS** — `npm test` (all green; the new test rejects with `TwdbValidationError`, and existing createMachine tests still pass because their fixtures use valid years) + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/machines.test.ts
git commit -m "feat(client): reject non-conforming year in createMachine/updateMachine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `baseUrl` optional + default + https guard

**Files:** modify `src/client.ts`, `README.md`; create `test/options.test.ts`.

- [ ] **Step 1: Write the failing test** — create `test/options.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TwdbClient } from '../src/client.js';

describe('TwdbClient baseUrl', () => {
  it('constructs with no options (defaults to https TWDB)', () => {
    expect(() => new TwdbClient()).not.toThrow();
  });
  it('allows http for localhost / 127.0.0.1 (test servers)', () => {
    expect(() => new TwdbClient({ baseUrl: 'http://127.0.0.1:8080' })).not.toThrow();
    expect(() => new TwdbClient({ baseUrl: 'http://localhost:8080' })).not.toThrow();
  });
  it('rejects plaintext http for a non-local host (credentials are POSTed)', () => {
    expect(() => new TwdbClient({ baseUrl: 'http://typewriterdatabase.com' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npm test` → `new TwdbClient()` errors (baseUrl currently required / `new URL(undefined)`), and the http-non-local case doesn't throw.

- [ ] **Step 3: Implement** — in `src/client.ts`:
  (a) make `baseUrl` optional: `baseUrl?: string;` in `TwdbClientOptions`.
  (b) add a default constant near `DEFAULT_UA`: `const DEFAULT_BASE_URL = 'https://typewriterdatabase.com';`
  (c) make the constructor arg optional and resolve + guard the base URL:

```ts
  constructor(opts: TwdbClientOptions = {}) {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const { protocol, hostname } = new URL(baseUrl);
    const localish = hostname === 'localhost' || hostname === '127.0.0.1';
    if (protocol !== 'https:' && !localish) {
      throw new Error(
        `twdb-client: baseUrl must be https (got ${baseUrl}) — credentials are posted, so plaintext http is refused`,
      );
    }
    this.#ua = new UserAgent({
      baseURL: baseUrl,
      name: opts.userAgent ?? DEFAULT_UA,
      maxRedirects: 5,
      keepAlive: opts.keepAlive,
    });
    this.#minInterval = opts.minRequestIntervalMs ?? 1000;
    this.#retryBackoffMs = opts.retryBackoffMs ?? 250;
  }
```

- [ ] **Step 4: Run it, verify PASS** — `npm test` (all green; existing tests pass http://127.0.0.1 mock URLs, which are allowed) + `npx tsc --noEmit`.

- [ ] **Step 5: Update the README quick-start** — change the construction line in `README.md` from
  `const twdb = new TwdbClient({ baseUrl: 'https://typewriterdatabase.com' });` to
  `const twdb = new TwdbClient(); // defaults to https://typewriterdatabase.com` and note `baseUrl` is
  only needed to point at a test server.

- [ ] **Step 6: Commit**

```bash
git add src/client.ts test/options.test.ts README.md
git commit -m "feat(client): baseUrl optional, default https TWDB, reject plaintext http

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `prepare` script (GitHub-dep consumable) + version bump

**Files:** modify `package.json`.

- [ ] **Step 1: Add the `prepare` script + bump the version** — in `package.json`:
  - add `"prepare": "tsc"` to `scripts` (runs on `npm install` of a git dependency → builds `dist/`, and before publish).
  - bump `"version"` from `0.1.0` to `0.2.0` (year validation + baseUrl change are notable).

- [ ] **Step 2: Verify the build hook works** — run:
```bash
rm -rf dist && npm run prepare && test -f dist/index.js && test -f dist/index.d.ts && echo "dist built"
```
Expected: `dist built`.

- [ ] **Step 3: Verify the suite + types** — `npm test` (all green) + `npx tsc --noEmit` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: prepare script (git-dep installable) + v0.2.0

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- `isValidTwdbYear` exported + unit-tested; `createMachine`/`updateMachine` reject non-conforming
  years with `TwdbValidationError` (fail-fast, no network).
- `baseUrl` optional (defaults to https TWDB), plaintext-http to a non-local host refused; tests +
  README updated.
- `prepare` builds `dist/` on install (so `github:jberger/twdb-client` is consumable); version 0.2.0.
- All vitest suites green; `tsc --noEmit` clean.
- Then: push to GitHub so DT can depend on it; DT integration plan (separate) follows.
