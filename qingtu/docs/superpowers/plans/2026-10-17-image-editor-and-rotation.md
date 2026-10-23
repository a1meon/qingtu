# Image editor naming and quarter-turn rotation

- [x] Rename the visible first/default tool to 图像编辑 while preserving module IDs and saved data.
- [x] Add icon-only rotation after split, opening left/right 90° and restore-direction controls with the actual compact panel height.
- [x] Rotate source-coordinate metadata, crop edges/links, split windows, import dimensions and each layout pose around its centre; retain assets, canvas and export settings.
- [x] Rotate only bounded client previews, rebuild them on reopen and include orientation in the actual export cache; normalize EXIF before explicit source-pixel turns.
- [x] Verify real source/preview/thumbnail/export pixels, square-cache invalidation, asymmetric crop/EXIF/split windows and left/right/reset/reopen UI. Fix intrinsic grid height clipping of rotated card thumbnails.
- [x] Complete 278 unit checks, build, native desktop/UI, crop/split/actions/close and compression-preview regression with hidden offscreen windows. Preserve the preview server.
