# Browser import connection recovery

On 2026-10-13, a user reported a PNG import as Failed to fetch and confirmed browser preview usage. The local port 4173 had no listener. Its prior Vite process was absent. This was a preview-service connection failure.

Restarted Vite as a detached process with PPID 1, listening only on 127.0.0.1:4173. PID and log are in artifacts/dev-server.pid and artifacts/dev-server.log. The local RPC responded successfully after restart.

Located the exact reported file in the user's Downloads directory and read its metadata: valid PNG, 5504x3072, 27254812 bytes. Used the actual browser file chooser to import that file. Accessibility state confirmed its exact filename, one queue image, processed result, 26 MB to 10 MB, unchanged 5504x3072 dimensions and enabled export. No source file was changed.

src/errors.js now maps known Chromium/WebKit fetch-disconnection messages to a concise local-service connection message. Regression test was observed failing before the change, then passed (2/2 error tests); build passed. This source change concerns preview diagnostics; the existing native 0.4.0 distribution does not depend on Vite.
