# Clear stitching import previews

- [x] Trace the first imported source preview and later processed preview: 480×360 source layers were enlarged during slow composition; final preview was 1200×800.
- [x] Reproduce loss of one-pixel detail and insufficient raster dimensions with real import/reopen and render tests.
- [x] Use a bounded 1600×1200 editor raster from the first displayed layer and for the actual processed preview. Preserve EXIF orientation, alpha, original bytes, small images and existing small project card thumbnails.
- [x] Verify the real drop flow while the composite is intentionally delayed, then verify its actual ready preview; run unit tests, build and relevant desktop checks, keep the preview running.
