package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallRecoversUnpreparedAndCommittedLeftovers(t *testing.T) {
	for _, committed := range []bool{false, true} {
		t.Run(map[bool]string{false: "staging crash", true: "committed cleanup"}[committed], func(t *testing.T) {
			stage, dest := installFixture(t)
			work := filepath.Join(dest, transactionDirectory)
			if committed {
				if e := stageInstall(stage, dest, os.Rename); e != nil {
					t.Fatal(e)
				}
				j, e := readInstallJournal(dest)
				if e != nil {
					t.Fatal(e)
				}
				j.Committed = true
				b, _ := json.Marshal(j)
				os.WriteFile(filepath.Join(work, "journal.json"), b, 0600)
			} else {
				os.MkdirAll(filepath.Join(work, "old"), 0700)
				os.Mkdir(filepath.Join(work, "new"), 0700)
				os.WriteFile(filepath.Join(work, "new", "partial"), []byte("partial copy"), 0600)
			}
			if e := stageInstall(stage, dest, os.Rename); e != nil {
				t.Fatal(e)
			}
			if e := rollbackInstall(dest, os.Rename); e != nil {
				t.Fatal(e)
			}
			b, _ := os.ReadFile(filepath.Join(dest, "轻图.exe"))
			expected := "old editor"
			if committed {
				expected = "new 轻图.exe"
			}
			if string(b) != expected {
				t.Fatal("restored wrong generation", string(b))
			}
		})
	}
}
func TestInstallRollbackForEveryOverlappingFileFailure(t *testing.T) {
	for failAt := 1; failAt <= 2*len(installFiles); failAt++ {
		t.Run(string(rune('A'+failAt)), func(t *testing.T) {
			stage, dest := installFixture(t)
			for _, n := range installFiles {
				os.WriteFile(filepath.Join(dest, n), []byte("old "+n), 0600)
			}
			count := 0
			if e := stageInstall(stage, dest, func(a, b string) error {
				count++
				if count == failAt {
					return errors.New("denied")
				}
				return os.Rename(a, b)
			}); e == nil {
				t.Fatal("expected failure")
			}
			for _, n := range installFiles {
				b, _ := os.ReadFile(filepath.Join(dest, n))
				if string(b) != "old "+n {
					t.Fatal("lost old file", n)
				}
			}
		})
	}
}

func installFixture(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	stage := filepath.Join(root, "stage")
	dest := filepath.Join(root, "自定义轻图")
	os.MkdirAll(stage, 0700)
	os.MkdirAll(filepath.Join(dest, "resources"), 0700)
	for _, n := range installFiles {
		if e := os.WriteFile(filepath.Join(stage, n), []byte("new "+n), 0600); e != nil {
			t.Fatal(e)
		}
	}
	os.WriteFile(filepath.Join(dest, "轻图.exe"), []byte("old editor"), 0600)
	os.WriteFile(filepath.Join(dest, "resources", "app.asar"), []byte("old resources"), 0600)
	os.WriteFile(filepath.Join(dest, "用户导出.png"), []byte("export"), 0600)
	return stage, dest
}
func TestInstallCommitAndExplicitRollback(t *testing.T) {
	stage, dest := installFixture(t)
	if e := stageInstall(stage, dest, os.Rename); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "轻图.exe"))
	if string(b) != "new 轻图.exe" {
		t.Fatal(string(b))
	}
	if e := rollbackInstall(dest, os.Rename); e != nil {
		t.Fatal(e)
	}
	b, _ = os.ReadFile(filepath.Join(dest, "轻图.exe"))
	if string(b) != "old editor" {
		t.Fatal(string(b))
	}
	if _, e := os.Stat(filepath.Join(dest, "qingtu-io.exe")); !os.IsNotExist(e) {
		t.Fatal("new helper survived rollback")
	}
	b, _ = os.ReadFile(filepath.Join(dest, "resources", "app.asar"))
	if string(b) != "old resources" {
		t.Fatal("old resources changed")
	}
}
func TestInstallRenameFailureRestoresOldApplication(t *testing.T) {
	for failAt := 1; failAt <= len(installFiles)+1; failAt++ {
		t.Run(string(rune('A'+failAt)), func(t *testing.T) {
			stage, dest := installFixture(t)
			count := 0
			e := stageInstall(stage, dest, func(a, b string) error {
				count++
				if count == failAt {
					return errors.New("simulated sharing violation/disk failure")
				}
				return os.Rename(a, b)
			})
			if e == nil {
				t.Fatal("failure expected")
			}
			b, _ := os.ReadFile(filepath.Join(dest, "轻图.exe"))
			if string(b) != "old editor" {
				t.Fatal("old executable lost")
			}
			b, _ = os.ReadFile(filepath.Join(dest, "resources", "app.asar"))
			if string(b) != "old resources" {
				t.Fatal("old resources lost")
			}
		})
	}
}
func TestInstallMissingSourceDoesNotChangeOldFiles(t *testing.T) {
	stage, dest := installFixture(t)
	os.Remove(filepath.Join(stage, "resources.neu"))
	if e := stageInstall(stage, dest, os.Rename); e == nil {
		t.Fatal("expected failure")
	}
	b, _ := os.ReadFile(filepath.Join(dest, "轻图.exe"))
	if string(b) != "old editor" {
		t.Fatal("changed before staging complete")
	}
}
func TestInstallFinishPreservesUnknownFilesAndProjects(t *testing.T) {
	stage, dest := installFixture(t)
	if e := stageInstall(stage, dest, os.Rename); e != nil {
		t.Fatal(e)
	}
	if e := finishInstall(dest); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(filepath.Join(dest, "用户导出.png"))
	if string(b) != "export" {
		t.Fatal("user file lost")
	}
	if _, e := os.Stat(filepath.Join(dest, "resources", "app.asar")); e != nil {
		t.Fatal("cleanup must be separate and explicit")
	}
}
