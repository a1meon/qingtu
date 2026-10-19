# Narrow sidebar toggle and offscreen verification

- [x] Reproduce the narrow layout: the inspector becomes a flyout but its open state is retained, and the restore toggle swaps location.
- [x] Collapse automatically when entering <=760px, keep the canvas centred; the latest follow-up releases its scale ceiling on all inspector state changes so content fits the new width.
- [x] Put a single show/hide toggle after optimization, centre its glyph, remove the inspector-heading toggle and start the narrow flyout below the toolbar.
- [x] Run all native smoke entry points with hidden offscreen rendering; remove native activation and visible screen-edge windows.
- [x] Verify narrow geometry, real mouse toggles, unit/build/native UI/continuous resize/close-save checks and keep the preview service running.

- [x] Follow-up: restore automatically on a wide viewport until a manual choice; preserve both manual open and manual closed choices across later resizes. Added an offscreen failing reproduction before fixing the missing restore branch.

- [x] Width follow-up: reproduce a 246px canvas in a 616px available fit after automatic collapse, release the old ceiling for both automatic/manual sidebar changes and verify filled/empty canvas refits.
