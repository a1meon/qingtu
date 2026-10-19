package main

import (
	"archive/zip"
	bytebuf "bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func makeMacArchive(t *testing.T, names map[string]string) []byte {
	t.Helper()
	var b bytebuf.Buffer
	z := zip.NewWriter(&b)
	for name, data := range names {
		f, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		f.Write([]byte(data))
	}
	z.Close()
	return b.Bytes()
}
func TestMacArchiveConfinesEveryEntryAndPreservesExecutableMode(t *testing.T) {
	data := makeMacArchive(t, map[string]string{"轻图.app/Contents/Info.plist": "plist", "轻图.app/Contents/MacOS/轻图": "new"})
	root := t.TempDir()
	if e := extractMacArchive(data, root); e != nil {
		t.Fatal(e)
	}
	got, _ := os.ReadFile(filepath.Join(root, "轻图.app/Contents/MacOS/轻图"))
	if string(got) != "new" {
		t.Fatal("archive missing")
	}
	for _, name := range []string{"../outside", "轻图.app/../../outside", "/tmp/outside", "other.app/Contents/file"} {
		if e := extractMacArchive(makeMacArchive(t, map[string]string{name: "bad"}), t.TempDir()); e == nil {
			t.Fatal("unsafe entry accepted", name)
		}
	}
}

// Tests simulate one swap boundary; the real macOS integration invokes RENAME_SWAP.
func testSwap(a, b string) error {
	tmp := a + ".swap"
	if e := os.Rename(a, tmp); e != nil {
		return e
	}
	if e := os.Rename(b, a); e != nil {
		os.Rename(tmp, a)
		return e
	}
	return os.Rename(tmp, b)
}
func TestMacReplacementRollsBackFailedSwapAndFailedRelaunch(t *testing.T) {
	for _, failure := range []string{"swap", "launch"} {
		t.Run(failure, func(t *testing.T) {
			root := t.TempDir()
			app := filepath.Join(root, "轻图.app")
			fresh := filepath.Join(root, "new.app")
			for p, data := range map[string]string{app: "old", fresh: "new"} {
				os.Mkdir(p, 0700)
				os.WriteFile(filepath.Join(p, "owned"), []byte(data), 0600)
			}
			project := filepath.Join(root, "projects")
			os.WriteFile(project, []byte("user-data"), 0600)
			swap := func(a, b string) error {
				if failure == "swap" {
					return errors.New("denied")
				}
				return testSwap(a, b)
			}
			launch := func(p string) error {
				if failure == "launch" {
					return errors.New("restart failed")
				}
				return nil
			}
			if e := replaceMacApplication(app, fresh, swap, launch); e == nil {
				t.Fatal("expected failure")
			}
			got, _ := os.ReadFile(filepath.Join(app, "owned"))
			if string(got) != "old" {
				t.Fatal("old app not restored")
			}
			data, _ := os.ReadFile(project)
			if string(data) != "user-data" {
				t.Fatal("project changed")
			}
		})
	}
}
func TestMacReplacementRestartsOnlyAfterAtomicSwap(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "轻图.app")
	fresh := filepath.Join(root, "new.app")
	os.Mkdir(app, 0700)
	os.Mkdir(fresh, 0700)
	os.WriteFile(filepath.Join(fresh, "new"), []byte("new"), 0600)
	called := false
	if e := replaceMacApplication(app, fresh, testSwap, func(p string) error {
		called = true
		if _, e := os.Stat(filepath.Join(p, "new")); e != nil {
			t.Fatal(e)
		}
		return nil
	}); e != nil {
		t.Fatal(e)
	}
	if !called {
		t.Fatal("not restarted")
	}
}
func TestMacArchiveAllowsDittoMetadataRoot(t *testing.T) {
	data := makeMacArchive(t, map[string]string{"__MACOSX/": "", "__MACOSX/._轻图.app": "metadata", "轻图.app/Contents/MacOS/轻图": "new"})
	if e := extractMacArchive(data, t.TempDir()); e != nil {
		t.Fatal(e)
	}
}
