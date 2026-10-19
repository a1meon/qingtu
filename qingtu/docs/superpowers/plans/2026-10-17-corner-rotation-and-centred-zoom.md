# Corner rotation and fixed-centre zoom

**Goal:** Replace rotation slider/quarter buttons with four outer-corner drag handles (Shift snaps absolute angle to 45°), retain precise bottom angle/reset, show selected image size, make controls follow actual image, and prevent clicks on off-canvas images from deselecting them. View zoom is fit-relative 100% by default, centre anchored, with no panning.

**Implementation:** Reuse validated angle metadata/export pipeline and revision-tagged save queue. Add a dedicated rotation overlay using RAF pointer tracking, angle delta and Shift snapping, Escape/pointer cancellation and lifecycle flush. ImageEditor retains the precision input/reset and shares its angle queue with corner gestures. Toolbar/panel render outside clipping ancestors with unbounded image anchors. Keep outside source content hit-testable separately from canvas clipping. Replace camera hook with project-local zoom only and a stationary centre; wheel only with Ctrl/Cmd and button/reset controls, percentage relative to fitted view.

- [x] Exercise actual outside-image click through native pointer hit testing before rendering changes. Initial right-side click retained selection; extend regressions to both sides and dragging back without claiming an unverified root cause.
- [x] Add failing angle gesture, unbounded toolbar and fixed-centre zoom math tests; implement helpers.
- [x] Implement corner handles and remove slider/±90 controls, with dirty/pending-save preservation, Shift and cancellation checks.
- [x] Make image toolbar follow actual pose including active move/resize; show selected image width × height in the info row separately from canvas size/view percentage.
- [x] Remove all viewport pan paths, preserve centre through zoom and reset, display default100% and allow enlargement.
- [x] Validate native gestures, image outside click/drag, source/pose persistence, view centring, no save/encode while held, actual exports, responsive layout and full UI. All tests hidden/offscreen. Record latest constraints and keep preview alive.
