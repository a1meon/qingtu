# Qingtu Auto Update Implementation Plan

> Execute inline in this session; the user has authorized implementation.

**Goal:** Desktop launch silently checks for updates, asks before download, offers restart installation; version button manually retries. Offline startup stays quiet.

**Architecture:** `desktop/update-controller.cjs` owns a testable update state machine around electron-updater. `desktop/update-source.cjs` resolves packaged Gitee or HTTPS generic configuration. `src/AppUpdates.jsx` owns version entry and native HTML dialog; no installer capability in browser previews.

**Tech Stack:** Electron, electron-updater 6, electron-builder 26, React 19, Node test runner.

**Spec:** User's latest update and mainland-China distribution requests; `docs/auto-update.md` records deployment requirements.

## Global Constraints

No download before user confirmation. No automatic forced restart. No error prompt on offline startup. Manual checks have clear status and retry. Keep existing blue UI and short labels. No unconfigured/fake feed. Mac uses signed builds; Windows uses NSIS rather than directory ZIP for installation. Publishing is separate from local implementation and requires a real repository or HTTPS source.

### Task 1: Update source and controller

- [x] Write failing behavioral tests: consent/download guard, startup offline silence, manual offline feedback, recheck after failure, duplicate checks, downloaded state, install guard, Gitee latest resolution, HTTPS validation.
- [x] Run `node --test tests/update*.test.cjs` and observe failures.
- [x] Implement source resolution and controller methods `status()`, `check(manual)`, `download()`, `install()`, subscribed state transitions.
- [x] Run focused tests until green; use injected native adapter because tests must never install or quit the user's app.

### Task 2: Desktop and UI integration

- [x] Add limited IPC methods and subscription through preload; install checks active processing.
- [x] Add version button after brand and compact dialog for check/available/download/ready/error states. Use `<dialog>` focus trapping and Escape, existing primary button, reduced-motion handling.
- [x] Test real Electron flow with adapter fixture, ensuring no download from check or decline, progress and restart confirmation, manual retry; browser identifies desktop-only functionality.

### Task 3: Distribution and verification

- [x] Add packaged update-source configuration and script generating a generic provider build config from Gitee/HTTPS settings. Use per-platform/architecture feed folders and absolute artifact URLs.
- [x] Preserve Mac DMG+ZIP / Windows NSIS. CI produces yml/blockmap along with binaries. No publishing or account changes without source details.
- [x] Run all unit tests, production build, existing native smoke sequentially, update smoke and packaged resource validation.
- [x] Document missing repository/certificate separately from implemented behavior; keep detached browser preview alive.

Verified locally: 66 tests; native update smoke; regression image/UI smoke; packaged Apple Silicon UI/engine; three-platform ASAR/updater/config consistency and archive checks. No real update repository or signing certificate has been supplied; no online release was published or actual cross-version install claimed.
