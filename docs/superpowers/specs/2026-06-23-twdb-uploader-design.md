# TWDB Uploader — desktop app design

**Date:** 2026-06-23
**Status:** Approved (design); pending written-spec review
**Relates to:** `@joelberger/twdb-client` (the shared engine), and Dynamically Typed (the first
consumer / proving ground). See memory: [[dt-leads-app-trails]], [[twdb-uploader-north-star]],
[[twdb-sync]].

## Goal

A cross-platform **Electron desktop app** that lets any Typewriter Database user bulk-upload their own
collection from a folder of photos — resizing and form-filling handled for them — with transparent,
resumable, on-disk state. It is the **second consumer** of `twdb-client` (DT is the first).

## Audience & north star

Optimize for the **big-backlog collector**: dozens-to-hundreds of machines not yet on TWDB, stalled by
the friction of resizing every image and filling every form (it feels hopeless, so they never start).
Audience skews **non-technical and older**. Therefore the design must:
- **Remove the resize barrier** — images are resized automatically by `twdb-client`; the user never
  resizes anything.
- **Remove the form barrier** — infer as much metadata as possible from the folder path so the
  per-machine step is mostly *confirm/correct*, not type-from-scratch; batch affordances to move fast.
- **Beat hopelessness with resumability + visible progress** — on-disk per-machine state makes it
  stop-and-resume (10 today, 20 tomorrow); the machine list shows "X of Y on TWDB."
The 1–2-machine user is supported but is not the primary optimization target.

## Architecture

- **Electron** app; `twdb-client` runs in the **main (Node) process** (renderer drives the UI, IPC to
  main for library calls + filesystem). Single-user-local: the operator uses their own TWDB login,
  which never leaves their machine.
- **The local filesystem is the source of truth and the state store** — no hidden database. Everything
  the app knows lives in human-readable YAML inside the user's photo tree (+ a tiny app-config/keychain
  entry for the remembered session).

## Data model (two visible YAMLs per machine folder)

- **`machine.yaml`** (the user edits): `make`, `model`, `year`, `serialNo`, `description`, and
  `photos:` — a list of `{ file, role: cover | typeSample | gallery | skip, caption }`.
- **`machine.twdb.yaml`** (the app maintains): `twdbUrl`, `galleryId`,
  `photos: { <file>: { twdbPhotoId, twdbPhotoUrl, hash } }`, `lastPushedAt`. The per-file `hash` lets
  the app detect a new/changed photo. Split files give clean ownership: the app rewrites state without
  touching the user's edits/comments, and vice versa.

## Discovery & inference

- The user picks a **library root**; the app walks the tree.
- **Machine detection (first guess):** a folder that *directly contains image files* is a machine; once
  a `machine.yaml` exists, that folder is definitively a machine. (Heuristic — validate on beta users.)
- **Inference (first encounter, no `machine.yaml` yet):** tokenize the path relative to the root (split
  on `/`, `-`, `_`, spaces), **longest-match tokens against the TWDB brand list** (so "Smith Corona" /
  "L.C. Smith" resolve), extract a **year** (4-digit or x-form), and treat the **leftover tokens as the
  model** guess. Write that as the starting `machine.yaml`. The review screen then refines it.

## Shared logic → promote into `twdb-client`

Per the DT-leads/app-trails strategy, the reusable pure logic moves into the library so both consumers
share one implementation:
- Promote from DT's `src/lib/twdbMap.ts`: `suggestTwdbYear`, `suggestMatch`, `resolveExact`.
- Add a new pure **`inferMachineFromPath(relPath, brandNames)`** → `{ brandGuess, modelGuess, yearGuess }`.
- DT refactors to import these from `twdb-client` (no behavior change). The library continues to own
  generic/pure logic + the remote existence check; each consumer owns its sync-state (DT in Payload,
  the app in on-disk YAML).

## Credentials

- In-app TWDB **login** (username + password).
- **Remember me (optional, default on):** store the **password** encrypted via Electron's
  **`safeStorage`** — ciphertext in app-data, with the encryption key held in the **OS keychain**
  (Keychain / DPAPI / libsecret), so the secret is keychain-protected, **never a readable flat file**.
  The username is remembered in plain app-config. On launch the app silently re-logs-in from the stored
  password, so the user never re-types (matters for occasional use over a long backlog).
- Storing the password (rather than a cached session) is deliberate: TWDB **sessions expire**, so a
  remembered session would usually be dead next launch and prompt anyway. (A low-stakes TWDB account,
  keychain-encrypted, is an acceptable trade for the ease-of-use the audience needs.)
- If nothing is stored, decryption fails, or login fails, the user enters the password that launch
  (RAM only) and may opt back into remembering.

## UX flow

1. **Pick library root** (remembered between runs).
2. **Machine list** — every detected machine with status from the state files: *new* / *on TWDB* /
   *has new photos*; a header progress count ("X of Y on TWDB").
3. **Per-machine review** (mirrors the DT patterns): metadata fields **pre-filled from inference** with
   **brand/model/year resolution** (pickers + suggestions, exact-match-or-prompt), and a **photo grid**
   for role (cover/type-sample/gallery/skip) + caption. Saving writes `machine.yaml`.
4. **Push** — per machine or "push all ready," with progress; the library's polite pacing (serialized
   queue + interval) is inherited, so a 200-machine run is well-behaved. Writes/updates
   `machine.twdb.yaml`.
5. Stop any time; re-launch resumes from the state files.

## Push & idempotency (mirrors DT's `twdbPush`)

- No `twdbUrl` in state → `createMachine` (cover + type-sample + gallery photos, plus the DT-style
  links — a backlink and YouTube if the user provides one) → record `twdbUrl`/`galleryId` + per-photo
  ids/urls in `machine.twdb.yaml`.
- `twdbUrl` present → `addPhoto` only files lacking a `twdbPhotoId` (matched by filename + `hash`) →
  update state. No metadata/photo edits to existing galleries in v1.
- State file is primary; `findMachine` (public hunter export, no login) is a cross-check / adoption path
  for galleries created outside the app.

## Packaging

Electron + **`electron-builder`**: Win/Mac/Linux installers, `sharp` rebuilt for Electron, code-signing
+ macOS notarization, (optionally) auto-update later. **A packaging/signing spike is the first slice** —
prove a signed, installable, `twdb-client`-logging build before building features (de-risks the part
that historically bites).

## Testing

- Pure helpers unit-tested in the library (`inferMachineFromPath`, the promoted resolvers) and in the
  app (YAML read/write, push-planning: which photos are new, create-vs-incremental).
- The Electron UI + live push verified manually (against a real backlog folder, with a beta collector).

## Build slices (for the plan)

1. **Packaging spike** — signed installable Electron shell that logs into TWDB via `twdb-client`.
2. **Library walk + inference + YAML** — root picker, machine detection, path inference, read/write the
   two YAMLs (promote the shared helpers to `twdb-client` here).
3. **Review UI** — machine list w/ status, per-machine metadata + resolution + photo-role grid.
4. **Push + state** — create / add-new-photos orchestration mirroring `twdbPush`, writing state.
5. **Polish** — progress, push-all-ready, error surfacing, onboarding for non-technical users.

## Out of scope (v1)

- Editing/deleting existing TWDB metadata or photos (re-sync) — deferred in DT too; the app catches up
  when DT does.
- Photo reordering; acting on behalf of other users (it's single-user-local); auto-update.

## Repo note

The app is its own new repo (sibling to `twdb-client`, like DT). The helper-promotion is a `twdb-client`
change consumed by both DT and the app. (This spec lives in the `twdb-client` repo for now as the shared
TWDB-tooling home; it moves/links to the app repo when that's created.)
