package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Only owned top-level files participate. Source projects/exports are never scanned.
var installFiles = []string{"轻图.exe", "qingtu-io.exe", "resources.neu", "icon.ico", "卸载轻图.exe"}

const transactionDirectory = ".qingtu-install"

type installJournal struct {
	Old       map[string]bool `json:"old"`
	Committed bool            `json:"committed,omitempty"`
}

// Keep the journal until both payload directories are gone. A failed cleanup
// must not lose the durable committed marker and later restore an old runtime.
func cleanInstallTransaction(work string) error {
	if e := os.RemoveAll(filepath.Join(work, "new")); e != nil {
		return e
	}
	if e := os.RemoveAll(filepath.Join(work, "old")); e != nil {
		return e
	}
	if e := os.Remove(filepath.Join(work, "journal.json")); e != nil && !os.IsNotExist(e) {
		return e
	}
	os.Remove(filepath.Join(work, "journal.tmp"))
	return os.Remove(work)
}

func copyInstallFile(source, target string) error {
	info, e := os.Lstat(source)
	if e != nil {
		return e
	}
	if !info.Mode().IsRegular() {
		return errors.New("installer source is not a regular file")
	}
	in, e := os.Open(source)
	if e != nil {
		return e
	}
	defer in.Close()
	out, e := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
	if e != nil {
		return e
	}
	_, e = io.Copy(out, in)
	if e == nil {
		e = out.Sync()
	}
	return errors.Join(e, out.Close())
}
func readInstallJournal(dest string) (installJournal, error) {
	var j installJournal
	data, e := os.ReadFile(filepath.Join(dest, transactionDirectory, "journal.json"))
	if e != nil {
		return j, e
	}
	e = json.Unmarshal(data, &j)
	if e != nil {
		return j, e
	}
	if len(j.Old) != len(installFiles) {
		return j, errors.New("invalid installation journal")
	}
	for _, n := range installFiles {
		if _, ok := j.Old[n]; !ok {
			return j, errors.New("invalid journal file")
		}
	}
	return j, nil
}
func stageInstall(source, dest string, rename func(string, string) error) (err error) {
	if err = os.MkdirAll(dest, 0755); err != nil {
		return
	}
	info, e := os.Lstat(dest)
	if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("invalid install directory")
	}
	work := filepath.Join(dest, transactionDirectory)
	if _, e = os.Lstat(work); e == nil {
		j, journalError := readInstallJournal(dest)
		if journalError != nil {
			old, oldError := os.ReadDir(filepath.Join(work, "old"))
			if oldError != nil && !os.IsNotExist(oldError) || len(old) != 0 {
				return errors.New("incomplete recovery journal; original files preserved")
			}
			// The journal is durable before the first target rename. With no backup
			// files an interrupted copy has not modified the installed application.
			if err = os.RemoveAll(work); err != nil {
				return
			}
		} else if j.Committed {
			if err = cleanInstallTransaction(work); err != nil {
				return
			}
		} else if err = rollbackInstall(dest, os.Rename); err != nil {
			return
		}
	} else if !os.IsNotExist(e) {
		return e
	}
	if err = os.Mkdir(work, 0700); err != nil {
		return
	}
	keep := false
	defer func() {
		if !keep {
			os.RemoveAll(work)
		}
	}()
	os.Mkdir(filepath.Join(work, "new"), 0700)
	os.Mkdir(filepath.Join(work, "old"), 0700)
	j := installJournal{Old: map[string]bool{}}
	for _, n := range installFiles {
		if err = copyInstallFile(filepath.Join(source, n), filepath.Join(work, "new", n)); err != nil {
			return
		}
		old, e := os.Lstat(filepath.Join(dest, n))
		if e != nil && !os.IsNotExist(e) {
			return e
		}
		if e == nil && !old.Mode().IsRegular() {
			return fmt.Errorf("invalid existing file: %s", n)
		}
		j.Old[n] = e == nil
	}
	data, _ := json.Marshal(j)
	f, e := os.OpenFile(filepath.Join(work, "journal.json"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	err = errors.Join(err, f.Close())
	if err != nil {
		return
	}
	keep = true // A failed rollback retains its recovery journal and old files.
	for _, n := range installFiles {
		if j.Old[n] {
			err = rename(filepath.Join(dest, n), filepath.Join(work, "old", n))
			if err != nil {
				break
			}
		}
		err = rename(filepath.Join(work, "new", n), filepath.Join(dest, n))
		if err != nil {
			break
		}
	}
	if err != nil {
		return errors.Join(err, rollbackInstall(dest, os.Rename))
	}
	return nil
}
func rollbackInstall(dest string, rename func(string, string) error) error {
	j, e := readInstallJournal(dest)
	if e != nil {
		return e
	}
	if j.Committed {
		return errors.New("installation already committed")
	}
	work := filepath.Join(dest, transactionDirectory)
	var failures []error
	for i := len(installFiles) - 1; i >= 0; i-- {
		n := installFiles[i]
		backup := filepath.Join(work, "old", n)
		target := filepath.Join(dest, n)
		if j.Old[n] {
			if _, e := os.Stat(backup); e == nil {
				if e = os.Remove(target); e != nil && !os.IsNotExist(e) {
					failures = append(failures, e)
					continue
				}
				if e = rename(backup, target); e != nil {
					failures = append(failures, e)
				}
			} else if !os.IsNotExist(e) {
				failures = append(failures, e)
			}
		} else if e = os.Remove(target); e != nil && !os.IsNotExist(e) {
			failures = append(failures, e)
		}
	}
	if len(failures) > 0 {
		return errors.Join(failures...)
	}
	return cleanInstallTransaction(work)
}
func finishInstall(dest string) error {
	j, e := readInstallJournal(dest)
	if e != nil {
		return e
	}
	work := filepath.Join(dest, transactionDirectory)
	j.Committed = true
	data, _ := json.Marshal(j)
	f, e := os.OpenFile(filepath.Join(work, "journal.tmp"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	_, e = f.Write(data)
	if e == nil {
		e = f.Sync()
	}
	e = errors.Join(e, f.Close())
	if e != nil {
		return e
	}
	if e = os.Rename(filepath.Join(work, "journal.tmp"), filepath.Join(work, "journal.json")); e != nil {
		return e
	}
	// Once committed, cleanup is best effort and retryable. It must never turn
	// the next installation into a rollback to the obsolete Electron runtime.
	_ = cleanInstallTransaction(work)
	return nil
}
func installCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}
	var e error
	switch args[0] {
	case "--install-stage":
		if len(args) != 3 {
			os.Exit(2)
		}
		e = stageInstall(args[1], args[2], func(a, b string) error {
			var err error
			for i := 0; i < 60; i++ {
				err = os.Rename(a, b)
				if err == nil {
					return nil
				}
				time.Sleep(500 * time.Millisecond)
			}
			return err
		})
	case "--install-rollback":
		if len(args) != 2 {
			os.Exit(2)
		}
		e = rollbackInstall(args[1], os.Rename)
	case "--install-finish":
		if len(args) != 2 {
			os.Exit(2)
		}
		e = finishInstall(args[1])
	default:
		return false
	}
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	return true
}
