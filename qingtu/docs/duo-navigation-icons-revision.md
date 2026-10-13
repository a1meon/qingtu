# Selected sidebar revision: icons with hover labels

Date: 2026-10-13.
User selected the first navigation option and asked to remove left-side text, showing functional names on hover instead. This is one targeted revision of that selected design, not a new set of competing options.

Revised mock: /Users/xx/Documents/ChatGPT/图片处理软件/qingtu/docs/duo-navigation-icons-hover-v2.png
Produced using built-in Image Gen. UI source was not changed; waiting for design confirmation under the user's design-before-development workflow.

## Implementation details once approved

Use ~80px icon-only rail, compression and reserved stitching icons, no permanent labels. Hover/focus tooltips show 压缩调整 and 图像拼接. Tooltips overlay content without changing toolbar placement, are delayed briefly and dismiss on pointer exit, blur and Escape. Keep accessible button names, keyboard focus support, and reduced-motion support. Reserved stitching entry remains unavailable until implemented but can expose its tooltip. Preserve all existing compression, preview, settings and queue behavior. Follow the current full-screen screenshot for visual language.

## Final generation prompt

Use case: ui-mockup. Asset type: precise revision of selected native desktop app design.
Input image is the USER-SELECTED Qingtu “Blue Studio Tool Sidebar” design. EDIT THIS EXACT DESIGN. Keep its visual identity, sky-blue raised tactile buttons, navy rounded Chinese typography, 2px outlines, white inspector, pale icy-blue workspace, overlapping blue/mint image-frame illustration, queue beneath preview, concise export settings and empty default state. No new visual exploration. Direction name: Blue Studio Icon Sidebar with Hover Labels.

USER CHANGE: remove ALL permanent text from the LEFT feature navigation. Only icons are visible in this navigation. Compress the previous wide sidebar to a clean 80px white icon sidebar; do not leave an empty 144px wide sidebar. At top a 52x52 rounded pale-blue selected icon button for compression, containing the existing friendly image/down-arrow icon. Under it a matching 52x52 reserved subdued-grey joined-panels icon for image stitching. No labels below or beside these icons within the sidebar, no “压缩”, “拼接”, “工具” or extra text in the sidebar. No extra modules or overflow button. Remaining empty space provides room for future tool icons.

SHOW THE HOVER INTERACTION in this single realistic mock: a small pointer hovering on the first blue icon and a compact dark navy tooltip floating to the RIGHT of the sidebar, outside it, with the exact short white Chinese text “压缩调整”. Tooltip has 8px radius and a tiny left pointer, vertically aligned with the hovered icon, offset 8px from sidebar, about 96px wide. It overlays the workspace as a transient tooltip rather than a permanent label or card. Only this ONE tooltip visible. The inactive image-stitching icon also supports a future hover tooltip “图像拼接”, but do not show a second tooltip simultaneously. This is a single UI state, no explanatory text or annotations.

1280 x 820 native desktop composition, wide ratio. Narrow sidebar means main image workspace gains width. Preserve 325px right inspector, 49px macOS titlebar with traffic lights safely separated from “轻图”, no browser/device frame. The image toolbar now begins 24px to the right of narrow sidebar with “未选择图片” and disabled “原图 / 对比 / 处理后” aligned on its right. No extra current-module heading. Illustration and blue “添加图片” button centered in the main workspace. Queue header “图片 0”, subtle trash icon and single 152x91 plus import tile exactly equal to future image thumbnail size, never demo photos.

Inspector exact labels and values: “导出” with reset icon; “大小” 10 MB; “尺寸” 1536 px and 1024 px with ratio-lock icon; “缩放” 100 %; “格式” “自动”; “输出文件夹”; “选择文件夹”; disabled “导出 0 张图片”. Preserve rounded chunky shapes and 3–4px blue bottom-edge button depth. No focus rings, gradients, excessive text, huge headings, mascot, gamification or status footer. Date anchor 2026-10-13; show no date. All controls fit within the screen, natural margins, crisp legible short text. Single screen only.

