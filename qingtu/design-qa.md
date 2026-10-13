# Blue Studio design QA — 0.4.0

Date: 2026-10-13

Source visual truth: docs/duo-blue-dropzone-expanded-v3.png and docs/duo-blue-dropzone-collapsed-v3.png.
Latest user overrides: matching blue primary buttons; 3840 × 2160 empty/reset dimensions; PNG default.

Implementation: http://127.0.0.1:4173/, actively tested in the Codex in-app browser.
Browser captures: artifacts/blue-ui-expanded.png, artifacts/blue-ui-collapsed.png, artifacts/blue-ui-minimum.png.
Native Electron captures: artifacts/native-blue-expanded.png and artifacts/native-blue-collapsed.png.

Viewport: 1280 × 820 CSS px, empty queue, light theme. Source 1568 × 1004 and native capture 2560 × 1640 (@2x) normalized to 1280 × 820; browser captures already 1280 × 820. Browser has no OS traffic lights; native position was separately verified at x14/y18. webContents capture excludes OS overlay controls; actual app reserves titlebar space.

## Findings and comparison history

Initial blocked iteration: artifacts/blue-ui-initial.png.
- [P2, resolved] Format control clipped by settings scroll region. Reduced section padding and control height below 760px; complete fields now fit at 1280×820 and 980×700.
- [P2, resolved] Transparent asset margins made paper character too small. Increased placement size and adjusted layout margins without stretching its pixels or aspect ratio.
- [P2, resolved] Inactive export button initially retained pale-blue fill. Latest user explicitly requested identical style; import and export now share fill/border/lower edge. Disabled export dims only its text and retains actual disabled semantics.

Post-fix combined side-by-side evidence:
- artifacts/blue-qa-final-native-expanded.png
- artifacts/blue-qa-final-native-collapsed.png
- artifacts/blue-qa-final-browser-expanded.png
- artifacts/blue-qa-final-browser-collapsed.png
Focused typography/control comparison: artifacts/blue-qa-final-inspector.png.
These combined inputs were opened and inspected after fixes. No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

Typography: rounded system Latin and Chinese fallback, readable 14–17px controls/labels, 28px heading, short text without awkward wrapping. Synthetic mock typography is not a precise available font; subtle system weight differences are P3.

Spacing/layout: narrow icon-only rail, wide inset rounded dashed workspace, bottom queue, white export inspector. Both queue photo/import tiles are 152×91px. Collapsing fully releases inspector width to preview and queue. All persistent controls remain available at native minimum 980×700.

Colors/tokens: #1CB0F6 primary, #0897DB solid lower edge, #111C36 text, #F0FAFF canvas, restrained neutral outlines. Matching primary actions override the older mock's grey export button. Browser screenshot color appears softer than native; actual CSS values and Electron evidence confirm production colors.

Image quality: individually generated folded blue picture-file raster at public/assets/blue-file-empty.png, RGBA with real transparent corners, correct eyes/hills/sun/accent marks and ellipse. No CSS/div/SVG illustration approximation. Its minor shading variation is P3. Standard functional icons use Phosphor; minor synthetic mock icon differences are P3.

Copy/content: short functional labels only; 4K/PNG are intentional changes from older 1536×1024/Auto mock values. No demo images, gamification, footer or extra explanations. Stitching remains an unavailable reserved icon with a name tooltip.

## Interaction and regression evidence

Browser:
- Sidebar collapse/restore, expanded workspace width, menu options and Escape.
- Imported the generated alpine-lake fixture through the actual browser file chooser, verified original/processed views and exported PNG through the UI. Restored the empty state afterwards. Evidence: artifacts/blue-ui-real-preview.png. Saved PNG verified as 1536x1024, 671221 bytes.
- Keyboard focus exposes reserved stitching name; no permanent navigation labels.
- Numeric/dropdown fields lack outer focus outline.
- 980×700 has no horizontal overflow and format/export controls fit.
- Console errors/warnings: none.

Real Electron UI smoke (desktop/ui-smoke.cjs):
- Empty/reset 4K fields; default PNG reaches actual encoder and exported PNG file.
- Hover/focus tooltips, Escape, unavailable stitching.
- Hidden controls inert; split position and decoded output retained.
- Sidebar toggling does not schedule a new encoding job.
- Reduced-motion emulation disables sidebar transitions and queue animation.
- Passed against local UI and packaged resources.

Native regression smoke (desktop/smoke.cjs):
- Import, original/compare/processed modes, real pending-state isolation.
- Direct split tracking at 75%, original letterbox isolation.
- 5000×2140 JPG export reaches original smaller byte budget.
- Native Mac button position; no renderer Node access. Passed.

42 engine/service/Sites tests passed.

Motion approximates the requested Duolingo interaction feel: 4px press, 190ms spring-like release, 210ms menu pop-in, 220ms tooltip delay, 260ms sidebar, 280ms queue/notice entry and 400ms success icon bounce. No continuous empty-state loops. Comparison line retains direct frame-based updates, without a spring transition.

## Follow-up polish and limits

P3: system font weight, minor icon geometry and raster shading can be refined later. Intel Mac/Windows packages are cross-built and not runtime-tested on native machines. No claim of identical Duolingo animation internals.

## Checklist

- [x] Generated asset placed; normal icons from library.
- [x] Required default values and shared button style.
- [x] Navigation hover/focus and collapsible inspector.
- [x] Default/minimum desktop viewport checked.
- [x] Real import/preview/encoding/export verified.
- [x] Combined visual evidence reviewed after fixes.

final result: passed

## 0.4.1 performance follow-up

No visual or motion changes. 53 tests and sequential native regression/UI smoke passed. Packaged Apple Silicon UI smoke and exact 5000×2140 JPEG save passed. All three ASARs match the current engine/service/cache and client assets; Windows ZIP CRC and x64 executable/native module checks passed. Real browser import of the user's 5504×3072 PNG and 10→9→10 MB target changes passed. Cold engine time fell from 17,465 ms to 9,356 ms, with byte-identical 10 MiB output. Warm byte-target change took 10 ms in the engine. Generated release/artifact files are excluded from Vite watching so packaging cannot reload the preview.

## 0.4.2 update flow

Version entry beside brand has a no-drag hit area and manual check action. Compact dialog reuses blue raised primary buttons, white secondary buttons, rounded geometry, reduced-motion handling and native HTML dialog focus trapping. Available/ready screenshots are `artifacts/update-available.png` and `artifacts/update-ready.png` from isolated update-adapter tests (version 0.5.0 is a fixture, not a published release). Screenshots inspected after animation completion.

66 tests passed. Real Electron update smoke verifies silent offline launch, manual retry, no download on check/decline, progress/background download, explicit restart action and dialog focus/Escape. Existing native image/UI smoke passes, including packaged Apple Silicon UI and exact byte-budget export. Browser version button accurately identifies desktop-only installation. All three 0.4.2 ASARs match engine/updater/client source; bundled electron-updater and unconfigured source resource verified. Windows archive CRC and x64 architecture checked. No remote feed/repository supplied, so actual server/download/cross-version installation remains unverified; Mac signing and Windows NSIS deployment remain prerequisites.
