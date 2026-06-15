# TWDB Client Library — Design

**Date:** 2026-06-12
**Status:** Draft for review
**Working name:** `twdb-client`

> Home: the standalone, public **`twdb-client`** repo (`/Users/joelberger/Programs/Node/twdb-client`).
> The design originated alongside the DynamicallyTyped project — its first consumer.

## 1. Purpose

A standalone, reusable client for the [Typewriter Database](https://typewriterdatabase.com)
(TWDB) — a web-1.0, form-driven community site with no published API. The library wraps TWDB's
forms behind a typed, polite, multi-user interface so tools can add and update machines and
photos programmatically.

It is **not** coupled to any one consumer. Two consumers are planned:

1. **Dynamically Typed (DT) sync** — DT is the source of truth; pushes the user's machines to
   TWDB. (First consumer.)
2. **A generic bulk-upload tool (CLI, later maybe a website)** that operates on behalf of *any*
   registered TWDB user. (Stated goal; not immediate.)

## 2. Guiding principles

- **DT is the high-res hub; TWDB is the downsampled contribution.** TWDB's resolution ceiling is
  a major reason DT exists. The library produces resized copies for TWDB and never touches or
  degrades originals — a one-directional, additive transform, not a compromise.
- **Generic + multi-user.** "Which user am I acting as" is a first-class input (per-session
  credentials). Nothing DT-specific lives in the library.
- **Be a good TWDB citizen.** TWDB is volunteer-run. The client must look like a legitimate,
  well-behaved client — honest identity, gentle pacing — never "an AI hammering the site." All
  recon and development go *through* the library and capture fixtures; live traffic is minimal.
- **Verify, don't assume.** TWDB's behavior is reverse-engineered; design around captured
  evidence, with explicit recon tasks for the unknowns.

## 3. Scope

**v1 (the library):**
- Authenticated session (login, session reuse, exportable session).
- Create / edit a machine (metadata + cover + type-sample).
- Add / edit / delete gallery photos.
- Edit links (e.g. YouTube) — pending the Links form.
- Resolve brand/model (name → numeric id).
- Resize-to-fit images before upload.
- Remote existence check (`findMachine` / `listMyMachines`) + photo enumeration.
- Polite HTTP (identity, pacing, caching) + typed errors + fixture-based parsing.

**Non-goals (v1):**
- The DT↔TWDB sync orchestration (lives in DT; its own spec/plan).
- The bulk-upload CLI/website (separate project; consumes this library).
- Local "have I synced this" state — **owned by each consumer**, not the library.
- TWDB's JS batch-upload widget — we loop the plain per-photo form instead.
- Photo re-ordering (deferred).

## 4. Architecture

Layered, bottom → top; each layer independently testable:

1. **Session / HTTP core** — built on **`@mojojs/user-agent`** (the mojo.js HTTP client). It
   provides a tough-cookie cookie jar (holds PHPSESSID), multipart/form-data uploads (`formData`
   with `{content, filename}`), urlencoded (`form`) bodies, redirect following (`maxRedirects`,
   handy for login-success detection), and an honest `User-Agent` via its `name` option. We add
   `login()`, login success/failure detection, our pacing/backoff (see §9), and a
   **serializable** session (`exportSession()`/`fromSession()` via tough-cookie jar
   serialization) so a website can persist a user's live session instead of their password.
2. **HTML parsing** — uses the user-agent's built-in DOM: `await res.html()` returns an
   `@mojojs/dom` tree queried with CSS selectors (`.at(sel)`, `.text()`, etc.). Confirms login,
   extracts a new machine's id/URL, scrapes brand/model option lists, enumerates photos.
   **All selectors live here** — one place to fix when TWDB's HTML shifts. (No separate
   `cheerio` dependency — the UA covers parsing too.)
3. **Brand / model resolver** — `listBrands()` / `resolveBrand(name)` (scrape + cache the
   `cat_id` options), `listModels(brandId)`. Maps friendly names to TWDB's numeric ids; decides
   existing-model vs. new.
4. **Image resizer** — `sharp`-backed; resizes to TWDB's stored dimensions before upload.
   Default-on, with a low-level "upload raw bytes" escape hatch for constrained runtimes.
5. **Operations (public API)** — typed, friendly methods (see §5) that map internally to TWDB's
   quirky field names (`gallery_name` = year, etc.).

**HTTP client: decided — `@mojojs/user-agent`.** It bundles the cookie jar (tough-cookie),
multipart uploads, redirects, and an HTML DOM, so it covers *both* the HTTP core and HTML
parsing in one cohesive, typed dependency (drops `got` + `tough-cookie` + `cheerio`). Also
honors the maintainer's involvement in Mojolicious / mojo.js. Politeness/backoff (§9) is layered
on top, since the UA doesn't bundle retry pacing.

## 5. Public API (shape, not final signatures)

Data model uses friendly names; the library translates to form fields.

```
class TwdbClient {
  constructor(opts: { baseUrl?; userAgent?; minRequestIntervalMs?; ... })

  // auth / session
  login(username, password): Promise<void>
  exportSession(): SerializedSession
  static fromSession(session): TwdbClient

  // machines
  createMachine(input: MachineInput): Promise<{ id, url }>   // metadata + cover + typeSample
  updateMachine(id, partial: Partial<MachineInput>): Promise<void>
  findMachine(criteria): Promise<MachineRef | null>          // remote existence check
  listMyMachines(): Promise<MachineRef[]>

  // photos
  addPhoto(machineId, image, opts?: { description?, watermark?, publish? }): Promise<{ photoId }>
  updatePhoto(machineId, photoId, opts): Promise<void>
  deletePhoto(machineId, photoId): Promise<void>
  listMachinePhotos(machineId): Promise<PhotoRef[]>          // ids + urls (not content identity)

  // links
  setLinks(machineId, links): Promise<void>                 // shape pending Links form

  // lookups (cached)
  listBrands(): Promise<Brand[]>
  resolveBrand(name): Promise<Brand | null>
  listModels(brandId): Promise<Model[]>
}

interface MachineInput {
  collection: 'My Collection' | 'Parting Out' | 'Sightings'
  brand: string | { id }          // resolved to cat_id
  model: string | { id }          // existing id or new name
  year: string                    // TWDB "gallery_name"
  serialNo: string
  description: string             // gallery_desc
  coverImage?: ImageSource        // resized before upload
  typeSampleImage?: ImageSource
  watermark?: boolean             // default true
}
```

`ImageSource` = path | Buffer | stream; resized to target dims by default.

## 6. Reverse-engineered TWDB endpoints (captured 2026-06-12)

- **Login:** `POST login.php` (urlencoded): `username`, `passwd`, `commit=Sign In`. Session =
  PHPSESSID cookie. **No CSRF token** on login or create.
- **Create / edit machine:** `POST typewriter_edit.php` (multipart). `id=0` creates, `id=N`
  edits. Fields: `site_id=1`, `gallery_active=1`, `collection`, `cat_id` (**brand = numeric
  id**), `models` (existing model id) OR `model` (new name, brand stripped), `gallery_name`
  (**year**), `serial_no`, `gallery_desc`, `photo` (**cover** file), `typesample` (**type
  sample** file), `photo_wm=1` (watermark), `submit`. Required: collection, cat_id, model,
  gallery_name, serial_no, gallery_desc.
- **Add photo:** `POST typewriter_photo_create.php` (multipart): `site_id=1`, `gallery_id`,
  `photo`, `photo_desc`, `photo_wm=1`, `photo_active` (publish), `submit`.
- **Edit/replace photo:** `POST typewriter_photo_edit.php`: `site_id=1`, `gp_id` (photo id),
  `gallery_id`, optional `photo` (replace), `photo_desc`, `photo_wm`, `photo_active`.
- **Editor tabs:** Description `typewriter_editor.php?id=N`, **Links
  `typewriter_editor_links.php?gallery_id=N`**, Gallery Photos, Re-ordering
  `typewriter_editor_photos_ordering.php?gallery_id=N`.
- **Stored image URL:** `…/img/g<galleryId>_<photoId>_<uploadTs>.jpg` — TWDB renames on upload;
  **original filenames are NOT preserved.**
- **Upload gate:** uploads must be **≤1000px** tall/wide; TWDB then reduces to **≤630px** (cover/
  gallery) and **≤550×300** (type sample).
- **Hunter collection export (existence / idempotency), captured 2026-06-15:**
  `GET typewriter_list_ajax.php?hunter_search=<hunterId>` → JSON (DataTables `aaData`; cells embed
  HTML carrying the machine id + `mfr_search=<brandId>`). Add `&output=csv` for a clean
  **TAB-delimited** table (despite the name): columns `id, hunter, status, typesample, serial,
  year, manufacturer, model, twdb_url, image, images` (`images` = photo count). **Public — no
  login.** `hunterId` is the numeric hunter id (joelaberger = 7773), distinct from the username.
  `status` ∈ {My Collection, Parting Out, Sightings}. The library reports `status` **verbatim and
  does not interpret it** — consumers own the mapping. Note TWDB has no dedicated *past /
  formerly-owned* bucket, so `Sightings` is **ambiguous**: originally "spotted in the wild (not
  owned)," but a hunter may repurpose it for past-collection machines. So don't hard-code
  Sightings as not-owned; the DT sync (separate spec) decides how to map each TWDB status onto
  DT's in-collection / past distinction.

## 7. Auth / session

Stateless-friendly: `login()` establishes the PHPSESSID cookie; the client reuses it. The
session is exportable so a website persists it per logged-in user (no password storage).
Login-success detection: **to confirm during recon** (redirect target vs. a logged-in marker
in the HTML). Re-login transparently on session expiry where detectable.

## 8. Images (the core value)

Manual resizing is the user's #1 barrier to using TWDB, and oversized uploads are rejected
(≤1000px gate). So the library resizes originals to TWDB's **stored** dimensions before upload
(≤630 cover/gallery, ≤550×300 type sample): clears the gate, minimizes bytes, and matches what
TWDB keeps anyway. `sharp` backend, default-on; raw-bytes escape hatch for odd runtimes.
Optional pre-resizing in a consumer is unnecessary but harmless.

**EXIF orientation (mandatory, learned the hard way in DT):** *every* image transform path must call
sharp's `.rotate()` (auto-orient) to bake EXIF orientation into the pixels **before** resizing/
cropping. TWDB **strips metadata** on upload, so an un-rotated transform publishes a sideways image
with no orientation tag to rescue it. In DT a crop path that omitted `.rotate()` (while the resize
path had it) shipped rotated images — so this is a per-path requirement, and each path must have an
orientation **test** (feed an `orientation:6`-tagged source, assert the output comes out upright).

**Decision — TWDB uploads are EXIF-independent.** We send **physically-rotated pixels with metadata
stripped**: `.rotate()` bakes the rotation in, and sharp's `.toBuffer()` drops EXIF by default (never
call `.withMetadata()`), so correct display never depends on TWDB honoring an orientation tag — it
re-encodes and we don't trust its EXIF handling. This is deliberately **unlike DT**, which keeps
EXIF-bearing originals (browsers honor EXIF and DT owns rendering). The resizer test asserts the
output has **no** orientation tag (orientation `undefined`/`1`) in addition to upright dimensions, so
EXIF-independence is a guarantee, not a sharp default we happen to inherit.

## 9. Politeness (baked into the library)

- **Honest `User-Agent`**: `twdb-client/<version> (+<repo-url>; <contact>)`.
- **Gentle pacing**: concurrency 1, a configurable min interval between requests,
  backoff-with-jitter on retries (no retry storms).
- **Cache** brand/model lists; don't re-fetch per operation.
- **Authenticated as the user, doing their own legitimate actions.**
- **Record-once, replay-forever**: one deliberate recon session captures response **fixtures**;
  development/tests run offline against fixtures. Fixture diffs surface upstream HTML changes.

## 10. Idempotency

- **Machine-level → library, remote-derived.** `findMachine`/`listMyMachines` read the user's own
  galleries via the **public** export `typewriter_list_ajax.php?hunter_search=<hunterId>&output=csv`
  (see §6). Match key = **manufacturer + model + serial** — serial alone is NOT unique across
  manufacturers (e.g. a Royal "12" vs a Remington "12"). `status` column gives the collection.
  Check-before-create, no local state, no HTML scraping.
- **Photo-level → consumer-local.** TWDB renames files and exposes no content hash, so "have I
  uploaded this image" can't be derived remotely. Each consumer keeps its own ledger (DT: Payload
  DB; CLI: a `.twdb-sync.json` in the photo directory). The library does **not** prescribe a
  store — DT and a directory-CLI are different policies, not one interface. Extract a shared
  helper later only if two real implementations prove the duplication.

## 10a. Adoption of existing collections

A generic, multi-user tool must assume a user arrives with a collection **already on TWDB** —
forcing them to recreate it would be a fatal adoption barrier. The design handles this without
over-building, by separating the two levels:

- **Machines: auto-reconciled, never recreated.** `listMyMachines`/`findMachine` already match
  existing galleries remotely (manufacturer + model + serial, via the public export). So on first
  run the tool **links** local machines to their existing gallery ids and back-fills the ledger
  automatically — a user with dozens of galleries does nothing. New machines are created; existing
  ones are matched.
- **Photos: additive by default, adoption opt-in.** Photos have no remote identity, so the default
  is conservative: the tool **manages only the photos it uploads** and leaves a gallery's
  pre-existing photos untouched. A user is productive immediately (push new machines/photos) with
  zero reconciliation. Bringing *existing* photos under management is an explicit, one-time step,
  offered at the effort level that fits: (a) manual mapping for a few; (b) **perceptual-hash
  assisted, human-confirmed** matching for many (download gallery photos, rank candidates by
  Hamming distance vs the resized DT/source images, user confirms — pHash is a *suggestion engine*,
  never an unattended dedup key); (c) skip entirely and only manage net-new.

**The ledger is population-agnostic.** An entry (`local item → gallery id / gp_id`) looks identical
whether it came from a tool upload, an automatic machine-match, manual entry, or a confirmed pHash
match. Adoption **policy lives in the consumer** (DT vs the CLI may differ); the library only ships
the generic primitives (`findMachine`, `listMyMachines`, `listMachinePhotos`, `addPhoto → gp_id`)
plus, later, an *optional* pHash helper — it never prescribes a store or a policy.

## 11. Errors & resilience

Typed errors: `AuthError`, `TwdbValidationError` (TWDB rejected the form), `UploadTooLargeError`,
`ParseError` (HTML didn't match expectations — signals TWDB changed). Centralized selectors +
fixtures make HTML drift a localized, test-detectable fix.

## 12. Distribution

Standalone **public/open-source** repo, TypeScript/Node. Ships compiled `dist/` + type
declarations. Consumed first as a **public git dependency** (`github:…#<tag>`), upgraded to a
published npm package later. Public ⇒ **DT's Docker build needs no registry auth** (no `.npmrc`
token). Pin versions; bump deliberately.

## 13. Testing

Fixture-driven: parsing/operations tested against captured TWDB responses (offline,
deterministic). A small, clearly-marked, opt-in live smoke test (gated on real credentials) for
end-to-end confidence, run rarely.

## 14. Build order (milestones)

1. **Slice 1 — polite core + recon tool.** Session/HTTP core (honest UA, pacing, cookie jar),
   `login()`, authenticated GET, fixture capture. *This is the instrument that recons the rest.*
   Resolve the open items in §15 by pointing it at the live pages.
2. **Slice 2 — machines.** Brand/model resolver, resizer, `createMachine`/`updateMachine`.
3. **Slice 3 — photos.** `addPhoto`/`updatePhoto`/`deletePhoto`/`listMachinePhotos`.
4. **Slice 4 — links + idempotency + hardening.** `setLinks`, `findMachine`/`listMyMachines`,
   error types, politeness/retry polish.

DT-side sync and the bulk CLI are separate downstream projects (own specs/plans).

## 15. Open questions — resolve during recon (slice 1)

- **(RESOLVED 2026-06-15, see §16)** Links → `create.weblink` (typed `link_name`+`link_url` rows);
  photo delete → `typewriter_photo_delete.php` (`confirmPhotoDelete(gp_id)`); login-success →
  "Log Out"/username marker; `models` populate via AJAX `GET mfr.<catId>.model_list`.
- **(STILL OPEN) Exact upload gate** (1000px hard reject? px vs. bytes?) — verify while building the
  resizer. Also confirm the new-vs-existing-**model** dedup when a new `model` name collides.
- **(RESOLVED 2026-06-15) `findMachine` key + `listMyMachines` source.** Both derive from the
  **public** export in §6. Match on **manufacturer + model + serial** (serial alone isn't unique
  across manufacturers). No login or scraping needed for existence checks.
- **`@mojojs/user-agent` specifics** — confirm `formData` accepts a **Buffer/stream** for binary
  image uploads (docs show string `content`); the cookie-jar **serialization** API for
  `exportSession`/`fromSession`; and that `@mojojs/dom`'s selector support covers our scraping
  (option lists, `img src`, traversal).

## 16. Recon results (captured 2026-06-15, hunter 7773 / gallery 25748)

Verified against live fixtures. Raw authenticated full-page captures are kept **local, not
committed** (may carry account PII); minimal sanitized fragments will be extracted per test.

- **Login success:** logged-in pages carry "Log Out" + the username; `login()`'s heuristic works.
- **Create machine:** `POST typewriter_edit.php` (multipart), `id=0`. Fields: `site_id=1`,
  `collection` (select, 3 opts), `cat_id` (brand select — **1067 server-rendered options** = the
  brand list), `models` (existing model id, AJAX-populated) OR `model` (new model name, text),
  `gallery_name` (year), `serial_no`, `gallery_desc` (textarea), `photo` (cover file),
  `typesample` (file), `photo_wm` (checkbox=1), `gallery_active=1`. Submit "Create Gallery".
- **Update machine:** SAME endpoint `POST typewriter_edit.php` with `id=<galleryId>`, reached via
  the tabbed editor `typewriter_editor.php?id=N` (NOT `typewriter_edit.php?id=N`, which renders a
  blank create form). Submit "Update Gallery". Existing values appear JS-populated, not in static HTML.
- **Brand list:** scrape `cat_id` `<option>`s from the create form (name → id); one fetch, cache.
- **Model list per brand:** `GET mfr.<catId>.model_list` (URL-rewritten; returns the `<option>`
  list). [`mfr.<catId>.models_list` — plural — feeds a separate search widget.]
- **Editor tabs:** Description `typewriter_editor.php?id=N`; Links `typewriter_editor_links.php?gallery_id=N`;
  Gallery Photos `typewriter_editor_photos.php?gallery_id=N`; Re-ordering
  `typewriter_editor_photos_ordering.php?gallery_id=N`. Public machine page: `see.<id>.typewriter`.
- **Links:** the Links tab submits `POST create.weblink`: `sub_app=typewriter`, `sub_id=<galleryId>`,
  `link_name`, `link_url` (generic typed rows; a YouTube link = name "YouTube" + url). Edit/delete
  weblink endpoints not yet captured.
- **Add photo:** `POST typewriter_photo_create.php`: `site_id`, `gallery_id`, `photo` (file),
  `photo_desc` (textarea), `photo_wm` (checkbox), `photo_active` (checkbox).
- **Edit/replace photo:** `POST typewriter_photo_edit.php`: `site_id`, `gp_id`, `gallery_id`,
  optional `photo` (replace), `photo_desc`, `photo_wm`, `photo_active`. One form per photo on the
  Gallery Photos tab → also the **`listMachinePhotos`** source (each carries its `gp_id`).
- **Delete photo:** `typewriter_photo_delete.php` via JS `confirmPhotoDelete(<gp_id>)` (confirm exact
  method/params when building). Ignore `typewriter_photo_multiupload.php` (the JS batch widget).
- **Existence / list:** public `typewriter_list_ajax.php?hunter_search=<hunterId>[&output=csv]` (§6);
  joelaberger = hunter 7773.

**Still open (verify while building):** the exact upload-size gate behavior, new-vs-existing-model
dedup, edit/delete-weblink endpoints, and the `@mojojs` specifics in §15.
