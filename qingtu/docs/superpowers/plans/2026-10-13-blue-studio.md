# Blue Studio Implementation Plan

Goal: implement the approved blue drop workspace and collapsible inspector while preserving the image engine.

Spec: docs/duo-blue-dropzone-revision.md, plus user-authorized 4K empty dimensions and default PNG; export and import share the blue raised button treatment.

Architecture: React App keeps image/config/job state; ToolNavigation owns an extensible reserved-tool registry; TooltipButton owns hover/focus labels. CSS owns brief tactile motion, with direct frame-based comparison drag unchanged. Existing Electron/sharp service stays intact.

- [x] Add a failing real Electron UI smoke covering defaults, tooltips, collapse retention and actual PNG export. Observed the old 1536 value fail against expected 3840 before implementation.
- [x] Generate the blue-file illustration as a transparent raster through Image Gen; use Phosphor for normal UI icons.
- [x] Implement icon rail, dashed preview workspace, same raised buttons, PNG defaults and retained-state sidebar toggle.
- [x] Verify native integration and engine tests; compare rendered empty expanded/collapsed states against approved mocks. Resolve clipped controls and image scale differences.
- [x] Build refreshed macOS/Windows packages and document validation and runtime limits.

No remote publishing or Git integration requested. Execute in this session; preserve user workspace.
