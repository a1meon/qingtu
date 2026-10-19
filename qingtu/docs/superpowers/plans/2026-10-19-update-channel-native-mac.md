# Stable update channel and native Mac controls implementation plan

> Execute inline in this existing branch; preserve installed app and user data.

**Goal:** Remove Gitee API as a prerequisite for updating and restore AppKit window buttons without a duplicate title row.

**Architecture:** A stable raw-repository signed platform manifest selects an immutable release tag. Public release HTML is an API-free fallback. Signatures and download hashes remain mandatory. A narrowly patched, pinned Neutralino MacWindow subclass owns the real AppKit controls, transparent titlebar and full-size content view.

**Tech stack:** Neutralino 6.10.0, React, Go, AppKit, existing Ed25519 identity.

**Spec:** Latest user request: API rate limiting must not force manual installer downloads; Mac buttons must be native.

## Global constraints

- Keep Windows 10/11 and macOS 13.3+, original signing key and 0.4.x migration compatibility.
- All UI tests hidden/offscreen; never replace /Applications/轻图.app or touch real projects during validation.
- Raw stable metadata becomes visible only after a complete formal release; never advertise previews.

### Task 1: API-independent updates

- [x] Add regression tests in tests/lite-updater.test.mjs for API returning 403, successful signed raw metadata, immutable download URL, invalid signature refusal, current version, and deduplicated checks.
- [x] Run PATH="$PWD/.cache/release-runtime/bin:$PATH" node --test tests/lite-updater.test.mjs and observe the blocked check fail.
- [x] Change src/lite/updater.mjs to use signed stable metadata and an API-free public release fallback, preserve backoff/locks and verified downloads.
- [x] Update desktop/update-source.cjs for the bridge channel and scripts for signed stable publication; exercise real static URLs and ensure previews cannot enter stable metadata.
- [x] Run relevant tests, full test:lite and update-click smoke, then commit.

### Task 2: Native Mac chrome

- [x] Create hidden native Cocoa fixture compiling the upstream MacWindow source; fail when standard native controls and full-size content/title-hidden properties are absent.
- [x] Add desktop/lite/macos/macwindow.mm and a reproducible pinned-source build script. Preserve the upstream close delegate so JS flush runs before exit.
- [x] Remove custom Mac DOM buttons; select native-mac mode, retain toolbar content inset and rounded backing.
- [x] Run the native fixture, hidden packaged WebKit import/export/close validation and hidden layout tests; cross-compile Intel runtime.
- [x] Build complete Windows/Mac release-compatible packages, validate signatures and record remaining native Windows/Intel limitations.

## Completion evidence

Implementation b374f26. 322 Node / 284 lightweight tests; Go and Windows cross-compile; all required checks. Native AppKit fixture and real hidden atomic updater pass. Real hidden 0.4.8→0.4.9→0.5.5 migration passed in isolated /tmp. Local 20-file release, signed manifests, official Sparkle archives and final NSIS payloads verified. Publication and live signed-channel results are recorded in docs/release-0.5.5.md after upload verification. Windows and Intel native execution remain unavailable.
