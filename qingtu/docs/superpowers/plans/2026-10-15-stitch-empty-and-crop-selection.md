# Stitch empty state and crop selection implementation plan

**Goal:** Provide a central new-canvas action and selectable special-crop image, defaulting to image 3 and 15% top crop.
**Architecture:** Retain the current workspace and explicit-create lifecycle. Normalize `optimization.imageNumber` as a 1-based integer 1–100 or null; missing fields default to 3. Preserve saved percentages and applied edits until optimization is clicked. No selected/present image uses the existing uniform horizontal crop.
**Tech stack:** React, Electron, Node test runner, Sharp.
**Spec:** Latest user request, recorded in AGENTS.md. Continue the repository-mandated codex/stitch-and-quality branch.

## Task 1: Targeted optimization
- [x] Add failing behavior tests in tests/optimization-settings.test.mjs for 15% applied crop, arbitrary current image number, null, missing positions and invalid numbers; extend project-store persistence coverage.
- [x] Run `node --test tests/optimization-settings.test.mjs` and confirm feature failures.
- [x] Update engine/optimization-settings.mjs and engine/stitch-optimize.mjs. Interface: `{topPercent:number,sidePixels:number,imageNumber:number|null}`; selected-image cuts remain exact, other images share proportional cuts, source/order remain immutable.
- [x] Add a bounded, keyboard-accessible selector in src/stitch/OptimizationSettings.jsx via Dropdown.jsx, pass image count through CanvasTools.jsx and retain the settings panel while interacting with the portal. Preserve absent selections when images are deleted.
- [x] Run unit tests and actual desktop smoke:optimization-settings for target changes, no selection, persistence/reopen and export.

## Task 2: Empty workspace action and validation
- [x] Add a failing desktop/ui-smoke.cjs assertion that the central new-canvas button creates one project from zero; ensure clear/reopen returns to zero with the action visible.
- [x] Render the existing mascot and blue primary button in StitchWorkspace.jsx only when no project exists. Reuse createCanvas; create nothing automatically. Keep empty existing canvas's Add images action.
- [x] Run npm test, npm run build, npm run smoke:desktop, npm run smoke:ui, npm run smoke:optimization-settings, npm run smoke:canvas, npm run smoke:recovery. Inspect real UI screenshots and keep detached browser preview available.
- [x] Update AGENTS.md and concise user documentation, record verified results and commit only after checks pass. Installation/publication is a separate request.

## Verification

254 Node tests, production build, all 13 repository desktop smoke scripts and both PNG quality/budget checks passed on Apple Silicon macOS. Native smoke confirms selection 4, none, default 3/15%, durable reopen, invalid-draft recovery, long dropdown scrolling/Escape, immutable originals and a real 598×240 / 334,178-byte PNG. UI smoke exercises central creation and clear/reopen. Screenshots and report are recorded in docs/portrait-workflow.md. This change has no installer/release update.
