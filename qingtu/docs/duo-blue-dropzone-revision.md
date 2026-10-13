# Blue drop workspace and collapsible inspector

Date: 2026-10-13. Targeted revision of the selected icon-only sidebar design, not a new set of options.

User requested central layout from the attached warm reference while retaining blue colors, and a collapsible right inspector.

Reference: /Users/xx/Documents/ChatGPT/图片处理软件/qingtu/docs/user-central-dropzone-reference.png
Expanded state: /Users/xx/Documents/ChatGPT/图片处理软件/qingtu/docs/duo-blue-dropzone-expanded-v3.png
Collapsed state: /Users/xx/Documents/ChatGPT/图片处理软件/qingtu/docs/duo-blue-dropzone-collapsed-v3.png

Both states were produced with built-in Image Gen. Design was approved and implemented in 0.4.0. Latest user overrides: matching blue primary buttons, 3840 × 2160 empty-state dimensions and default PNG. See project-root design-qa.md for visual and interaction verification.

## Implementation constraints

- Default right inspector expanded; separate reset and collapse controls. Collapse fully releases its width to workspace and queue. Restore toggle stays visible at top right when collapsed.
- Preserve current values, selected image, image preview, processing jobs and results across sidebar toggle; hiding controls must not reset them or start new jobs.
- Left rail icons only, name tooltips on hover/focus. Stitching remains reserved.
- One inset dashed rounded drop area and a compact friendly blue folded image-file illustration in empty state. No demo photographs. Queue below has plus tile matching photo tile size.
- Smooth brief sidebar transition; honor reduced motion. Split-line tracking still direct and frame-based.
- Actual source dimensions should populate controls after import; 1536 x 1024 shown in mocks are empty-state illustrative values. Maintain 10 MB default, JPG/PNG/Auto output and short UI labels.

## Expanded generation prompt

Use case: ui-mockup. Precise revised native desktop Qingtu application screen.
Image 1 is the existing selected BLUE icon-sidebar design, the base EDIT TARGET. Image 2 is the USER-PROVIDED reference for ONLY THE CENTRAL WORKSPACE: adopt its large inset rounded dashed drop boundary, compact original friendly folded image-file character with two tiny eyes, calm open spacing and centered import button. Combine those central features into Image 1, but KEEP BLUE COLOURS. Do not adopt Image 2's green/orange/cream palette. Do not remove the current left icon sidebar.

Create ONE realistic finished desktop screen in the EXPORT SIDEBAR EXPANDED state, composition 1280x820, no browser/device/mockup frame. Native macOS 49px titlebar and correctly placed traffic lights, “轻图” safely to their right. Left icon-only sidebar 80px wide, no visible navigation text: top compression image/download icon in a pale-blue rounded selected button with a blue bottom edge; next reserved stitching joined-panels icon in subdued grey. Both support hover name tooltips, but no tooltip or pointer shown in this default screen. White navigation surface and thin separator, lots of room for future modules, no other entries.

CENTRAL EDIT: icy-blue/near-white preview workspace. Inset by 22px a spacious rounded 22px-radius pale-blue DASHED drop boundary, extending around the empty preview and its file toolbar, ending above the queue separator. Toolbar inside top of boundary: “未选择图片” at left, disabled compact “原图 / 对比 / 处理后” on right. Main empty illustration is the friendly folded image-file from Image 2, with two tiny navy eyes and BLUE hills and SKY-BLUE sun/details, pale blue paper outline, little blue accent dashes, a tiny soft flat ellipse below. Illustration modest ~190x190px, NOT a giant mascot. Generous raised BLUE “添加图片” button centered below, dark-blue 4px solid lower lip. No gradient, no green/orange. No helper paragraphs. Below the drop area is the original image queue: short header “图片 0” and subtle trash icon; one plus import tile 152x91px, pale-blue dashed outline and tactile blue bottom lip, same size as future thumbnails. Short “添加图片” caption under the tile as in Image 2. No demo photos or actual thumbnails.

RIGHT EDIT: keep a 325px flat white export inspector but MAKE ITS COLLAPSE CONTROL CLEAR. Header “导出”, a small reset circular-arrow button, and beside it a separate compact right-panel-collapse icon button (a panel rectangle with right chevron), both aligned cleanly. Collapse is not an X close button and not a dropdown; clearly a sidebar toggle. Main controls remain concise and fit within the 820px window: “大小” 10 and MB dropdown; “尺寸” 1536 px and 1024 px with ratio lock; “缩放” 100 %; “格式” dropdown “自动”; “输出文件夹”, “选择文件夹”; disabled “导出 0 张图片” bottom. Space remains comfortable, no clipping, no floating cards.

Preserve selected Duolingo-like friendly tactile geometry: 2px contours, 16–20px rounded controls, sky-blue #1CB0F6 primary, #0897DB bottom edges, deep navy rounded Chinese typography (14–16px body), white/light icy-blue surfaces. Buttons look physically pressable, without shiny 3D. No permanent text on left, no outer focus halos, no status footer, no badges, gamification, marketing text, giant headings, extra tools or invented features. Actual default empty image state, 10 MB. Current date 2026-10-13 but show no date. Only one screen, no inset comparison of states or annotation.

## Collapsed generation prompt

Use case: ui-mockup. Asset type: second interaction STATE of the same precise Qingtu desktop design, not another competing visual option.
EDIT the attached expanded screenshot into its RIGHT EXPORT SIDEBAR COLLAPSED state. Keep exactly the same blue/mint-free pale-blue colour scheme, native titlebar, left icon-only navigation, central friendly folded blue image-file with tiny eyes, rounded dashed drag area, raised blue 添加图片 button and bottom queue. Main native composition 1280x820, same proportions and scale as attached.

STATE CHANGE ONLY: right inspector disappears COMPLETELY, with no leftover 325px gap and no narrow right rail. Expand the central workspace to fill ALL horizontal room between the 80px LEFT icon rail and the right window edge. Its rounded dashed drop boundary is inset 22px on each side, top 22px under the 49px macOS titlebar; ends 22px above the bottom image queue separator. File toolbar inside dashed area: “未选择图片” on left; compact disabled “原图 / 对比 / 处理后” aligned on the RIGHT, followed by a separate compact 40x40 rounded white right-panel-open toggle icon. This restore icon looks like a conventional sidebar rectangle with a chevron, uses same navy line icon style, is anchored at the far right of the toolbar with a 12px gap from the view controls. Keep it visible for reopening export settings. No textual “导出” button, no extra header or paragraph. Export controls and reset button are hidden while collapsed.

Recenter the SAME small friendly folded image-file character and SAME blue tactile 添加图片 button in the now larger preview area. Do not enlarge the character or button when preview grows. Character still about 190x190 px, blue paper border, two tiny navy eyes, blue hills/sun, small blue accent dashes and modest flat ellipse below. Primary button 280x60 px with 4px darker blue bottom lip. Main preview becomes broad, calm and roomy. Bottom queue extends from left rail to right window edge; “图片 0” header, trash icon far right, single 152x91px blue dashed plus import tile and short 添加图片 caption beneath. Default no imported photos.

Left rail is unchanged, icon-only compression selected and reserved image stitching grey, no permanent labels, no hover tooltip visible in this default state. Native macOS traffic lights and “轻图” unchanged. No helper copy, no date, no device frame, no giant headings, no other modules, no status footer, gradients or focus halos. Crisp readable 14–16px rounded Chinese typography and friendly 2px contours. Date anchor 2026-10-13; show no date. Single full screen, no annotations, arrows, inset screenshot or split-state presentation.

