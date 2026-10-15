# Multi-image special crop implementation plan

**Goal:** Show exactly one toggle button per actual image and independently configure any selected images.
**Architecture:** Add `optimization.specialCrops`, keyed by immutable image ID, with `{enabled,topPercent,sidePixels}` records. An explicitly present empty map selects none. Legacy single-number settings continue working and map to the actual image when edited; preserve 15%/100px and default image 3. Fixed selected crops remain exact, unselected images share the remaining canvas ratio, and all-selected layouts must already match the canvas. UI renders only actual images and separate parameter blocks; save valid settings without applying crops or encoding.
**Tech Stack:** React, Electron, Node test runner, Sharp.
**Spec:** Latest user feedback recorded in AGENTS.md. Retain the repository-mandated current branch and existing exports.

- [x] Add failing multi-crop geometry, legacy conversion, validation and persistence tests; observe RED.
- [x] Add failing native checks for zero/exact button counts, independent fields and actual multi-image output.
- [x] Implement shared normalization/conversion and exact multi-crop geometry.
- [x] Replace the dropdown with wrapping image toggles and independent fields; handle invalid drafts and remove portal exceptions.
- [x] Verify saved/reopened parameters follow image IDs through reorder and remain independent between canvases.
- [x] Run tests/build and repository native/quality checks sequentially; inspect screenshots, update docs and leave preview available.
- [x] Commit after verification. No installer publication.

Verification: 262 tests, build, all 14 desktop checks and both quality/budget checks passed on darwin arm64. Actual independent multi-crop export: 600×240, 335,410 B / 10,000,000 B. Screenshot and report are saved under docs/portrait-workflow-validation. Preview remains available on port 4173. No installer publication.
