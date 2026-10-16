# Stable canvas view and card rename

**Goal:** Keep the visible canvas bounds unchanged when deselecting enlarged images, and rename canvases from a double-clicked card name or a card context-menu action.
**Architecture:** Correct the nullable selection/editor state used by viewport fitting. Reuse the active project's existing update/save queue and literal export names; card rename activates its target canvas before editing. Inline name editing commits on Enter/blur/normal close, cancels on Escape, and keeps edits visible after a save error.
**Spec:** User feedback 2026-10-16, current AGENTS.md, preserve actual canvas/image geometry, user projects, selected export scope and original files. Continue on the current development branch without publishing installers.

- [x] Reproduce viewport shrink using real canvas bounds before/after blank-click deselection.
- [x] Extend native name tests for double-click, context rename, Enter/blur commit, Escape, autosave, export and reload.
- [x] Implement the minimum state guard and inline rename UI with flush integration.
- [x] Verify unit/build and relevant sequential desktop checks; preserve the live browser preview and push verified source.
