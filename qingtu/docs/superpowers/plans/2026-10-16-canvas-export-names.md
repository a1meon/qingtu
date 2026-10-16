# Canvas export names

**Goal:** Preserve user-entered canvas names everywhere and use the same name for browser and desktop exports.
**Architecture:** Stop display-only name rewriting. Mark stitching render results as canvas exports and share safe filename derivation across native save and browser download, preserving the compression workflow's naming. Cached pixels must receive the current renamed project name.
**Spec:** User feedback on 2026-10-16. Keep original bytes, actual format extensions and exclusive collision-safe writes. Do not replace the running app or publish installers.

- [x] Reproduce literal-name rewriting and unwanted export suffix with failing unit tests.
- [x] Implement literal display names, full dotted canvas names and shared browser/native filenames.
- [x] Verify renamed single/batch exports, persisted card/title/checkbox names, cached pixels, collisions and compression naming. Build and run appropriate desktop checks; retain the browser preview.

Validation: 264 unit tests, build, native desktop and full UI checks passed. Real batch exports: 画布 12.png and 我的成片.v1.2.png. Current browser backend returned those literal names after cached renames, with downloaded bytes equal to saved bytes. See ../..//canvas-name-validation/report.json and renamed.png. Illegal filesystem characters are replaced, known output extensions are not duplicated, and reserved Windows device names are made safe. No new installer published.
