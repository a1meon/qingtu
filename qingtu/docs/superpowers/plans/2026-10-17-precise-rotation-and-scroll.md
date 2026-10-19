# Precise rotation and unobstructed view controls

**Goal:** Support typed and fine adjusted image angles; ordinary wheel/trackpad scroll pans; move view controls into the existing information row below the view.

**Architecture:** Retain lossless source quarter-turn metadata, and add a separate `angle` transform applied after source crop and display resize. This keeps immutable originals, existing source windows and crop coordinates intact. Apply the transform consistently to source/ghost/selection/crop/split layers, thumbnails and final composition. Fine-angle drag previews stay local until release/blur/Enter/close. Keep navigation local and portal its existing controls into a reserved slot in the existing info row.

**Constraints:** Preserve all existing changes. No publishing in this request. No test windows on screen. Opening controls must not shrink images. Panel remains below image, may leave the display area. Preserve existing quarter-turn projects and export/cache correctness.

- [x] Add failing tests for finite precise angles, centre preservation, transformed bounds, source-window/crop/quarter-turn export and cache invalidation; implement angle metadata/math and real composition.
- [x] Add precise input (0.1°), slider, quick ±90° and reset with immediate lightweight preview and committed save; update thumbnail and rotated editing coordinate handling.
- [x] Change ordinary wheel to x/y pan; Ctrl/Cmd+wheel remains anchored zoom. Move navigation controls to the existing info row so they never cover pixels/handles.
- [x] Add hidden/offscreen native checks for real input/slider, no encode while held, reload/export, scroll vs zoom and no control overlap. Update previous tests to latest behavior.
- [x] Build, run unit tests and relevant native crop/split/rotation/navigation/UI regressions sequentially; record evidence and keep preview alive.

## Verification

285 Node tests passed and production build passed. Hidden/offscreen precise-angle, ordinary-scroll/modifier-zoom, crop, split, selection, quarter-turn, floating editor and full UI regressions passed. Focused review findings were fixed and rechecked: queued angle saves preserve newer drafts, rounded angle boundaries remain canonical, and odd source splits at fine right angles retain exact export pixels. Preview remains HTTP 200 on port 4173.
