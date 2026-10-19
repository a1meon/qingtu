# Image actions and adaptive optimization

Implement inline in the current authorized branch, preserving user data and the running app.

- [x] Reproduce selected-image Delete/Backspace failure outside the image DOM focus and narrow-original optimization failure.
- [x] Route Delete/Backspace to the live selected image; protect editable fields, inactive modules, dialogs and repeated operations.
- [x] Show crop/split/delete as labelled, tooltip-only icons; remove checkbox wrapper focus rings.
- [x] When ordinary original ratios are too narrow, crop their top/bottom symmetrically to fill the remaining horizontal canvas ratio. Preserve exact special crops and immutable originals, fixed canvas dimensions and idempotence. Validate and export vertical fractional crops through the real engine.
- [x] Verify unit tests, build and required desktop/quality checks sequentially; capture the changed UI, update product constraints and keep the preview available.
