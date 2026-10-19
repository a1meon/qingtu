//go:build darwin

package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func writeFixturePlist(t *testing.T, app, version string) {
	t.Helper()
	os.MkdirAll(filepath.Join(app, "Contents/MacOS"), 0700)
	text := `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.qingtu.update-fixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>` + version + `</string></dict></plist>`
	if e := os.WriteFile(filepath.Join(app, "Contents/Info.plist"), []byte(text), 0600); e != nil {
		t.Fatal(e)
	}
}
func TestMacPendingTransactionRecoversOnlyTheInstalledNewVersion(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "轻图.app")
	work := filepath.Join(root, ".qingtu-update-fixture")
	os.Mkdir(work, 0700)
	writeFixturePlist(t, app, "0.5.5")
	p := macUpdatePlan{Version: "0.5.5", Target: app, Fresh: filepath.Join(work, "轻图.app"), Backup: filepath.Join(work, "previous"), PID: 123, Token: strings.Repeat("a", 64)}
	b, _ := json.Marshal(p)
	os.WriteFile(filepath.Join(work, "plan.json"), b, 0600)
	got, e := pendingMacUpdateIn(app)
	if e != nil || got == nil {
		t.Fatal("pending swapped transaction lost", e)
	}
	writeFixturePlist(t, app, "0.5.4")
	got, e = pendingMacUpdateIn(app)
	if e != nil || got != nil {
		t.Fatal("uncommitted candidate acknowledged", e)
	}
}
func TestActualDittoMacArchiveExtractsAndRetainsCodeSignature(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "轻图.app")
	writeFixturePlist(t, app, "0.5.5")
	data, e := os.ReadFile("/usr/bin/true")
	if e != nil {
		t.Fatal(e)
	}
	os.WriteFile(filepath.Join(app, "Contents/MacOS/fixture"), data, 0755)
	if out, e := exec.Command("/usr/bin/codesign", "--force", "--sign", "-", app).CombinedOutput(); e != nil {
		t.Fatal(string(out), e)
	}
	zip := filepath.Join(root, "candidate.zip")
	if out, e := exec.Command("/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, zip).CombinedOutput(); e != nil {
		t.Fatal(string(out), e)
	}
	data, _ = os.ReadFile(zip)
	out := filepath.Join(root, "extracted")
	os.Mkdir(out, 0700)
	if e = extractMacArchive(data, out); e != nil {
		t.Fatal(e)
	}
	if e = validateMacCandidate(filepath.Join(out, "轻图.app"), app, "0.5.5"); e != nil {
		t.Fatal(e)
	}
}
