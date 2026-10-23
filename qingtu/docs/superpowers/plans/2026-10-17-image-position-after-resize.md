# Move a resized image within a structured layout

- [x] Reproduce with three 180×240 originals: shrink the middle from the top-left to 90×120, then drag y=120→0. The old structured-drag branch discarded the position-only move.
- [x] Keep direct reordering when the pointer drops onto another original layout rectangle; otherwise commit the moved x/y with normal edge/centre snapping. Remove nearest-image fallback for an empty-space drop.
- [x] Verify real pointer shrink/top/intermediate/bottom moves, unchanged other poses/canvas/order, actual exported alpha/colour pixels, reopen persistence and direct reorder after reopening.
- [x] Complete unit/build/native UI/content-fit/resize regression and save offscreen evidence.
