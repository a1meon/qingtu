# Qingtu icon and size ceiling implementation plan

**Goal:** Match the approved blue UI icon, enforce an actual byte ceiling, and refine the existing fields and reserved tool.
**Architecture:** Keep the shared Sharp engine as the single desktop/browser encoder. Smart exports use a decimal MB ceiling and real encoded bytes, with no padding. Keep native updating unchanged.
**Tech stack:** React, CSS, Sharp, Electron, generated PNG packaged as ICNS/ICO.
**Spec:** Latest direct user request, recorded in AGENTS.md.

- [x] Add regression cases that reject padding and permit a resized smaller source to use the requested budget; run and observe failures.
- [x] Change smartSize limit to requested bytes, guard every return, remove smart padding, retain quality search and cache; update old exact-budget tests to the new contract.
- [x] Convert UI targets/display to decimal MB/KB, remove old exact setting and obsolete padding hints.
- [x] Refine inputs with rounded pale fill, inset tactile edge, blue caret/text cursor, border-only focus and reduced-motion support; show stitching development tooltip on hover/focus/click.
- [x] Copy generated icon into project, package all platform icon sizes, wire favicon and desktop build icons. Retain Windows resource editing while disabling signing.
- [x] Run tests/build/native smoke, inspect empty browser UI and tool tooltip, package separate local 0.4.5 artifacts without overwriting published 0.4.4 or touching the running user app.
