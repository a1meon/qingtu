# Lightweight Desktop Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the current complete UI as a genuinely small Windows/Mac release, commit/push it and publish verified Gitee installers.

**Architecture:** Retain React and pure engine algorithms; swap Electron/Node/Sharp host for Neutralino system WebView plus a worker using wasm-vips through a Sharp-compatible facade. Native bridge provides file/dialog/window and durable-project operations; updates retain explicit download/restart consent and original signing identity.

**Tech Stack:** Neutralino6.10.0, wasm-vips0.0.19 (libvips8.18.7), React/Vite, tiny native I/O/update helpers as needed.

**Spec:** docs/lightweight-desktop-spec.md

## Global Constraints

- User accepts macOS13.3+ and Windows10/11 with WebView2, including first-time online runtime installation when absent.
- Preserve all current uncommitted UI work, originals/projects and original private signing seed. Source snapshot: artifacts/before-lightweight-20261019.patch and untracked archive.
- Test processes remain hidden, entirely offscreen and never active.
- Never publish/advertise a working package before it passes engine/UI/persistence/update/package verification. Record measured artifact bytes and platform execution limitations.
- Gitee each asset<100MB; check quota, back up/verify earliest releases and delete only if space is insufficient before source push/publication.

## Task 1 — Runtime/size/compatibility gate

Files: `.cache/lite-probe/*` (ignored probe), `docs/lightweight-desktop-spec.md`.

- [x] Verify npm integrity and official framework SHA256 before extraction.
- [x] Measure native framework and complete engine package, inspect shipped dependencies.
- [x] Run a no-window WKWebView PNG roundtrip with isolation headers; check `artifacts/lite-webkit-probe.json` contains width2/height2 and no error.
- [x] Obtain user's system-requirement preference; retain new agreed minimums in spec.
- [x] Add pinned build dependencies and a separate lightweight build so existing Electron reference remains testable.

## Task 2 — Shared image engine in a worker

Files: `src/lite/sharp.mjs`, `src/lite/worker.mjs`, `src/lite/native-rpc.mjs`, `src/lite/node-fs.mjs`, `src/lite/node-crypto.mjs`, `path-browserify`, Vite lightweight config and tests.

Interfaces: Sharp facade implements only actual engine call surface (metadata, EXIF/rotate, resize/extract/composite, colour/alpha, raw/PNG/JPEG/WebP, clone, keepMetadata). `toBuffer({resolveWithObject:true})` returns Buffer data plus width/height/channels. Worker consumes `{id,method,args}` and emits `{id,result}` / `{id,error}`; native requests use distinct typed RPC messages. Existing image/service/project modules remain the behavior specification.

- [x] Write backend equivalence tests using generated RGBA/JPEG/EXIF fixtures: import/orientation, no-upscale previews, crop/stretch/rotate/split/composite, exact-source retention, full-colour PNG bounds and actual byte budgets.
- [x] Implement operation pipelines with explicit wasm image lifetime management; release intermediate wasm objects after completed buffers/metadata and bound caches.
- [x] Implement worker scheduling/obsolete-preview handling by reusing service algorithms; preview never cancels real exports.
- [x] Run equivalence tests against actual wasm output, including large/tight-budget fixtures; compare pixels/limits rather than just file presence.

## Task 3 — Native bridge and recoverable storage

Files: `src/lite/main.jsx`, `src/lite/bridge.mjs`, native filesystem adapter/helper and `neutralino.config.json`.

Interfaces: expose the current `window.qingtu` API before loading `src/main.jsx`; platform must match darwin/win32. Bridge provides all preload methods/events and worker-native RPC. Project root preserves old `qingtu/stitch-projects` location. File adapter supports read/write, exclusive create, atomic rename, flush, directory enumeration and safe removal; no original files may be removed.

- [x] Implement import/chooseFolder/save/reveal/window/menu/close-flush, including external file drops and no-canvas import.
- [x] Test shared legacy manifest/assets schemas with generated originals, interrupted saves/backup recovery, exclusive export naming and rename-after-cached-output, no active-user-app changes.
- [x] Preserve original native titlebar/menu behavior or provide an equivalent tested lightweight host adjustment.
- [x] Run hidden native WebView UI checks for both modules, real exports and normal-close flushing.

## Task 4 — Update and installers

Files: lightweight packaging scripts, native update helper/bridge, signed manifests and release docs.

- [x] Reuse original Mac signing identity; authenticate manifests/full files, retaining explicit download/install confirmation (Mac opens the verified DMG; one-time manual migration from Electron) and no install-on-ordinary-quit.
- [x] Build Windows NSIS with WebView2 prerequisite handling, actual application resources and uninstaller; package both Mac architectures with actual app bundles/DMGs/ZIPs.
- [x] Ensure old update baselines safely handle new OS minimums/host migration; verify discovery and explain any required one-time baseline instead of silently breaking old clients.
- [x] Inspect full contents for browser/Node runtimes, foreign native binaries, private keys, test fixtures or user data. Measure sizes; verify signatures, hashes and actual Apple Silicon packaged engine/UI exports. Record Windows/Intel native-execution limits honestly.

## Task 5 — Verification, remote commit and Gitee release

- [x] Run current Node suite, relevant hidden native regressions plus lightweight equivalence/persistence/UI/update tests and production builds.
- [x] Review the implementation against spec and resolve important findings.
- [x] Recheck actual Gitee asset quota using the current public asset list plus previously verified per-file sizes; authenticated upload validates the server limit. If needed, download/checksum/backup earliest releases before authorized deletion; retain as much history as fits.
- [x] Commit all authorized current UI/lightweight changes and push codex/stitch-and-quality without merging main or including ignored secrets/caches.
- [ ] Upload only verified complete installers/metadata/checksums, verify anonymous downloads/full-package hashes and update discovery, then mark formal release.
- [ ] Record measured byte sizes, release/source URLs, cleanup actions and remaining platform test limitations; leave web preview running.
