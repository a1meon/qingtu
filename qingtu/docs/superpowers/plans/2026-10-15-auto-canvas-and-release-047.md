# Automatic canvas creation and 0.4.7 release plan

**Goal:** Create a canvas when external images are dropped into an empty stitching workspace, shorten optimization image buttons to numbers, push verified source and publish Windows x64 / Mac arm64 / Mac x64.
**Architecture:** Keep the existing import queue and lock, acquire a canvas inside the locked import operation with `getCurrent() || await create()`, then import into that fixed owner. Keep the existing accessible labels while shortening visible button text. Use the current signed multipart Gitee release workflow and unchanged private signing material.
**Tech Stack:** React, Electron, Node tests, Sharp, electron-builder, Sparkle and Gitee Releases.
**Spec:** Latest user request and AGENTS.md; current branch remains codex/stitch-and-quality.

- [x] Extend native UI tests: dropping files into zero canvases creates exactly one canvas, retains original bytes, imports all files, appends future drops without creating duplicates, ignores internal preview drags; observe failure before implementation.
- [x] Assert number-only button text in optimization settings; retain multi-selection, per-image parameters and default third choice.
- [x] Implement automatic creation within the existing import lock, record product feedback, bump package version/lock to 0.4.7, run unit/build and required sequential desktop/quality checks.
- [ ] Commit and push the verified branch to origin; build all three platform packages without changing the signing seed, verify signatures, source parity, packaged Apple Silicon runtime, installer DMGs and real updater downloads.
- [ ] Check Gitee attachment quota and compare with actual package bytes before upload. If insufficient, back up and verify the earliest release, then remove only the earliest necessary version(s) under the user's current cleanup authorization. Preserve the user's running app and queue.
- [ ] Upload the complete verified 0.4.7 release, anonymously validate all parts/full hashes/signatures and updater SDKs, then mark it official and verify current-version no-download checks. Save evidence and push release documentation.

The current request explicitly authorizes remote source submission, Windows/Mac publication and oldest-first quota cleanup if needed. No main merge or running-user-app replacement is requested.
