# Selected canvas export implementation plan

**Goal:** Export exactly one or several chosen stitching canvases.
**Architecture:** Keep editing focus independent of an ephemeral export selection. Null selection preserves default all-nonempty export; an explicit array filters the eligible IDs, including an explicit empty array. Checkboxes and a select-all control update only selection, never project data or preview encoding. Export snapshots the selected IDs; an unselected invalid active canvas must not block valid selected canvases.
**Tech Stack:** React, Electron, Node tests, existing local renderer/encoder.
**Spec:** Latest user request; record it in AGENTS.md, overriding the older no-checkbox requirement. Use the repository-mandated existing branch.

## Task 1: Export scope and card selection
- [x] Add a failing scope unit test and native selected-export flow; observe failures before implementation.
- [x] Extend project-export.js with optional explicit selection and preserve default all behavior.
- [x] Add separate card checkboxes, a mixed-state select-all control, exact count and no-selection disabling. Keep card opening, context export, deletion, shortcuts and busy locking coherent.
- [x] Verify real one/two-canvas outputs, unchanged focus/pixels, module switching, empty/deleted canvases and an invalid unselected canvas.

## Task 2: Regression and delivery
- [x] Update the old no-checkbox assertion and product constraints/docs; register/exclude the smoke script appropriately.
- [x] Run unit tests, build and all repository-required native/quality checks sequentially; inspect screenshots.
- [x] Leave the detached browser preview available, record evidence and commit after checks pass. Do not publish installers.

## Verification

255 Node tests, build, 14 desktop checks and both quality/budget checks passed on Apple Silicon macOS. Native selected-export smoke verified real single/multiple PNGs, keyboard input/export, independent selection, no save/encoding for ready pixels, empty/deleted filtering and invalid unselected canvases. Evidence is recorded in docs/portrait-workflow.md. No installers were published.
