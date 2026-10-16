# Canvas selection and Mac close implementation plan

**Goal:** Hide ineligible export checkboxes, move eligible controls right without a surrounding badge, default new stitching projects to 30 MB, clear selection on blank space and show overflow only for the selected image; diagnose and fix Mac close hangs.
**Architecture:** Preserve the existing export eligibility and project persistence, keep selection transient, and filter the overflow interaction layer by selection. Trace the native close → renderer flush → project save path and reproduce a concrete blocker in isolated Electron tests before changing it.
**Tech Stack:** React, Electron, Node, Sharp.
**Spec:** User feedback of 2026-10-16 and AGENTS.md. Continue on codex/stitch-and-quality; preserve running app, original files and signing material. Existing saved export limits remain unchanged; 30 MB means 30,000,000 bytes for new stitching canvases only.

- [x] Extend native regression tests for empty-card eligibility, selection clearing, selected-only overflow and existing crop controls. Record expected failures.
- [x] Trace Mac close with real native window close; test clean close, pending import/export/save and stalled thumbnail image decoding. Record reproduction and distinguish OS conventions from application blocking.
- [x] Implement the focused UI, default and confirmed close-path corrections without discarding unsaved edits or forcing the user's app to quit.
- [x] Run unit/build, relevant sequential desktop regressions and required quality checks. Inspect screenshots and local browser preview, document limitations and results.

Validation: 262 unit tests and all 22 checks passed. Native Mac red-button close and save-failure/retry behavior verified separately. No user app replacement or new release publication. Details: docs/canvas-selection-and-mac-close.md.
