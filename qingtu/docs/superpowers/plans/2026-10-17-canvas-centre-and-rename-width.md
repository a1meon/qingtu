# Canvas centre, responsive scale and rename width

- [x] Reproduce 1101→1100 resize: drawn canvas grows from 519px to 585px because layout releases inspector/rail space. Also cover the 760px breakpoint.
- [x] Centre the visible artwork, reduce button size and preserve uniform scaling; frame the asset's transparent margins only through CSS.
- [x] Keep a display-only resize scale ceiling through breakpoint transitions, while explicit inspector actions and viewport growth can refit normally.
- [x] Make rename inputs follow measured glyph width and stay centred, capped to the card; preserve save/cancel semantics.
- [x] Verify viewport sequences, centre/scale geometry, short/long rename input widths, real import, unit/build/workbench and close/save regression; save evidence and leave preview running.
