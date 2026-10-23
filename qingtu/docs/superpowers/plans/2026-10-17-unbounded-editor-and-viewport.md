# Unbounded editor and movable viewport implementation plan

> **Execution:** Inline in the current session. Preserve the current branch and all accumulated changes.

**Goal:** Keep parameter controls centred immediately below the image, allow them outside canvas/work area, and add view-only zoom, pan and reset.

**Architecture:** Keep canvas rendering clipped to the work area, but portal the parameter panel to the document with fixed viewport coordinates. Derive its position from the displayed image, without clamping or changing fit. Keep zoom/pan in local UI state, compose them with the existing fit and freeze the composed view for image gestures.

**Tech Stack:** React 19, CSS, existing Phosphor icons and hidden/offscreen Electron smoke tools. No new dependencies.

**Spec:** Latest user request in this chat; supersedes work-area clamping recorded in AGENTS.md and docs/floating-image-controls.md.

## Constraints

- Opening controls never changes image/canvas bounds or source/export parameters.
- Panel remains below the actual image and may overlap surrounding UI outside the work area.
- Zoom/pan/reset never save or encode image data. Preserve existing crop, split, rotation and selection behavior.
- Buttons, wheel zoom, hand drag, middle drag and Space-drag must be usable without activating native test windows.
- Keep current browser preview alive. Tests remain entirely hidden/offscreen.

### Task 1: View math and unbounded anchors

Files: src/stitch/canvas-viewport.js, tests/canvas-viewport.test.mjs.

- [x] Replace old clamp expectations with literal below-image positions, including offscreen/negative rectangles; run and observe failure.
- [x] Add cursor anchored zoom and composed-view tests. A point at x=150 in a 400px area must stay fixed when zoom changes from 1 to 2: camera x becomes 50. Cover zoom bounds and input immutability.
- [x] Implement `zoomCanvasCamera(camera,factor,anchor,bounds)` and `applyCanvasCamera(fit,camera)`; parameter placement becomes `{left:rect.x+(rect.width-300)/2,top:rect.y+rect.height+10,width:300}`.
- [x] Run targeted Node tests and confirm all pass.

### Task 2: Portal parameters and local view interaction

Files: src/stitch/useCanvasNavigation.js (new), src/stitch/StitchCanvas.jsx, src/stitch/ImageEditor.jsx, src/styles.css.

- [x] Add hook for project-keyed local camera, RAF pan, wheel zoom anchored to cursor, Space/middle/hand dragging, cancellation and trailing-click protection. Preserve editor/selection while navigating.
- [x] Compose camera before freezing crop/resize gesture view. Render compact minus/percentage/plus/hand/reset controls independently of canvas transform.
- [x] Measure work-area viewport origin with ResizeObserver/layout updates; send fixed panel coordinates to ImageEditor. Portal the parameter panel to document.body and recognize panel clicks as editor content. Do not clamp panel drag offsets.
- [x] Add native smoke tests for unchanged opening bounds, panel beyond work-area hit testing, anchored zoom, hand/Space/middle pan, reset, no saves/encodes and accurate image edits after zoom.
- [x] Build and run the smoke entirely offscreen; inspect screenshots.

### Task 3: Regression and durable documentation

Files: desktop/floating-editor-smoke.cjs, desktop/ui-smoke.cjs, package.json, AGENTS.md, docs/floating-image-controls.md.

- [x] Replace superseded within-area panel assertions with below-image anchors and no-fit-change assertions.
- [x] Run unit/build plus native crop, split, selection, rotation and navigation checks sequentially. Run full UI regression.
- [x] Record results and latest behavior in project docs. Verify browser preview HTTP 200. No packaging/publishing in this request.

## Results

280 Node tests passed; production build passed. Hidden/offscreen navigation, floating editor, crop, split, selection, rotation and full UI smoke passed. Navigation additionally checks real reset-button hit testing while the unbounded parameter panel crosses it. Browser preview remains HTTP 200 on port 4173.
