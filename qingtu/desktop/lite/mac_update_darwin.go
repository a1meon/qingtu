//go:build darwin

package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type macUpdatePlan struct {
	Version string   `json:"version"`
	Target  string   `json:"target"`
	Fresh   string   `json:"fresh"`
	Backup  string   `json:"backup"`
	PID     int      `json:"pid"`
	Token   string   `json:"token"`
	Args    []string `json:"args,omitempty"`
}

func ownMacBundle() (string, error) {
	exe, e := os.Executable()
	if e != nil {
		return "", e
	}
	exe, e = filepath.EvalSymlinks(exe)
	if e != nil {
		return "", e
	}
	bin := filepath.Dir(exe)
	contents := filepath.Dir(bin)
	app := filepath.Dir(contents)
	if filepath.Base(bin) != "MacOS" || filepath.Base(contents) != "Contents" || !strings.HasSuffix(app, ".app") {
		return "", errors.New("not running from an installed Mac application")
	}
	return app, nil
}
func macPlist(app, key string) (string, error) {
	b, e := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :"+key, filepath.Join(app, "Contents/Info.plist")).Output()
	return strings.TrimSpace(string(b)), e
}
func validateMacCandidate(candidate, target, version string) error {
	id, e := macPlist(target, "CFBundleIdentifier")
	if e != nil || id == "" {
		return errors.New("invalid installed application identity")
	}
	newID, e := macPlist(candidate, "CFBundleIdentifier")
	if e != nil || newID != id {
		return errors.New("update application identity mismatch")
	}
	v, e := macPlist(candidate, "CFBundleShortVersionString")
	if e != nil || v != version {
		return errors.New("update application version mismatch")
	}
	if e = exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", candidate).Run(); e != nil {
		return fmt.Errorf("invalid update application signature: %w", e)
	}
	return nil
}
func prepareMacUpdate(archive, expectedHash string, expectedSize int64, version string, pid int, args []string) (string, error) {
	target, e := ownMacBundle()
	if e != nil {
		return "", e
	}
	if pid <= 1 {
		return "", errors.New("invalid application process")
	}
	info, e := os.Lstat(archive)
	if e != nil || !info.Mode().IsRegular() || info.Size() != expectedSize || expectedSize < 1 || expectedSize > 300000000 {
		return "", errors.New("invalid update archive")
	}
	data, e := os.ReadFile(archive)
	if e != nil {
		return "", e
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != expectedHash {
		return "", errors.New("update archive hash mismatch")
	}
	work, e := os.MkdirTemp(filepath.Dir(target), ".qingtu-update-")
	if e != nil {
		return "", fmt.Errorf("应用所在目录不可写，请将轻图移到可写的应用程序目录后重试: %w", e)
	}
	keep := false
	defer func() {
		if !keep {
			os.RemoveAll(work)
		}
	}()
	if e = extractMacArchive(data, work); e != nil {
		return "", e
	}
	fresh := filepath.Join(work, "轻图.app")
	if e = validateMacCandidate(fresh, target, version); e != nil {
		return "", e
	}
	token := make([]byte, 32)
	if _, e = rand.Read(token); e != nil {
		return "", e
	}
	// Only the existing hidden fixture switches survive an automatic relaunch.
	var restartArgs []string
	for _, arg := range args {
		if arg == "--qingtu-smoke" || strings.HasPrefix(arg, "--qingtu-test-root=") {
			restartArgs = append(restartArgs, arg)
		}
	}
	plan := macUpdatePlan{Version: version, Target: target, Fresh: fresh, Backup: filepath.Join(work, "previous"), PID: pid, Token: hex.EncodeToString(token), Args: restartArgs}
	planFile := filepath.Join(work, "plan.json")
	encoded, _ := json.Marshal(plan)
	if e = os.WriteFile(planFile, encoded, 0600); e != nil {
		return "", e
	}
	executable, e := os.Executable()
	if e != nil {
		return "", e
	}
	helper := filepath.Join(work, "update-helper")
	if e = copyInstallFile(filepath.Join(filepath.Dir(executable), "qingtu-swap"), filepath.Join(work, "swap-helper")); e != nil {
		return "", e
	}
	if e = copyInstallFile(executable, helper); e != nil {
		return "", e
	}
	log, e := os.OpenFile(filepath.Join(work, "update.log"), os.O_CREATE|os.O_WRONLY, 0600)
	if e != nil {
		return "", e
	}
	defer log.Close()
	cmd := exec.Command(helper, "--apply-mac-update", planFile)
	cmd.Stdout = log
	cmd.Stderr = log
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if e = cmd.Start(); e != nil {
		return "", e
	}
	for i := 0; i < 100; i++ {
		if _, e = os.Stat(filepath.Join(work, "worker-ready")); e == nil {
			keep = true
			cmd.Process.Release()
			return planFile, nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	cmd.Process.Kill()
	cmd.Wait()
	return "", errors.New("update worker did not start")
}
func readMacUpdatePlan(file string) (macUpdatePlan, error) {
	var p macUpdatePlan
	work := filepath.Dir(file)
	if filepath.Base(file) != "plan.json" || !strings.HasPrefix(filepath.Base(work), ".qingtu-update-") {
		return p, errors.New("invalid update plan path")
	}
	b, e := os.ReadFile(file)
	if e != nil {
		return p, e
	}
	if e = json.Unmarshal(b, &p); e != nil {
		return p, e
	}
	if len(p.Token) != 64 || p.PID <= 1 || filepath.Dir(p.Target) != filepath.Dir(work) || p.Fresh != filepath.Join(work, "轻图.app") || p.Backup != filepath.Join(work, "previous") {
		return p, errors.New("invalid update plan")
	}
	return p, nil
}
func completeMacUpdate(file, token string) error {
	p, e := readMacUpdatePlan(file)
	if e != nil {
		return e
	}
	target, e := ownMacBundle()
	if e != nil || target != p.Target || token != p.Token {
		return errors.New("update startup identity mismatch")
	}
	if e = os.WriteFile(filepath.Join(filepath.Dir(file), "started"), []byte(token), 0600); e != nil {
		return e
	}
	// A reboot can end the watchdog after the atomic exchange. A healthy new
	// frontend acknowledges and cleans that durable transaction on its next launch.
	b, _ := os.ReadFile(filepath.Join(filepath.Dir(file), "worker-ready"))
	pid, _ := strconv.Atoi(string(b))
	command, _ := exec.Command("/bin/ps", "-p", strconv.Itoa(pid), "-o", "command=").Output()
	if pid <= 1 || !strings.HasPrefix(strings.TrimSpace(string(command)), filepath.Join(filepath.Dir(file), "update-helper")) {
		return os.RemoveAll(filepath.Dir(file))
	}
	return nil
}
func applyMacUpdate(file string) error {
	p, e := readMacUpdatePlan(file)
	if e != nil {
		return e
	}
	work := filepath.Dir(file)
	exe, e := os.Executable()
	if e != nil || filepath.Clean(exe) != filepath.Join(work, "update-helper") {
		return errors.New("update worker identity mismatch")
	}
	if e = os.WriteFile(filepath.Join(work, "worker-ready"), []byte(strconv.Itoa(os.Getpid())), 0600); e != nil {
		return e
	}
	deadline := time.Now().Add(90 * time.Second)
	for syscall.Kill(p.PID, 0) == nil {
		if time.Now().After(deadline) {
			return errors.New("application did not close; original preserved")
		}
		time.Sleep(100 * time.Millisecond)
	}
	launch := func(target string) error {
		name, e := macPlist(target, "CFBundleExecutable")
		if e != nil || filepath.Base(name) != name {
			return errors.New("invalid bundle executable")
		}
		args := append(append([]string{}, p.Args...), "--qingtu-update-state="+file, "--qingtu-update-token="+p.Token)
		cmd := exec.Command(filepath.Join(target, "Contents/MacOS", name), args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if e = cmd.Start(); e != nil {
			return e
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		deadline := time.Now().Add(60 * time.Second)
		for time.Now().Before(deadline) {
			if b, e := os.ReadFile(filepath.Join(work, "started")); e == nil && string(b) == p.Token {
				return nil
			}
			select {
			case e := <-done:
				return fmt.Errorf("updated app exited before startup: %v", e)
			default:
			}
			time.Sleep(100 * time.Millisecond)
		}
		cmd.Process.Kill()
		<-done
		return errors.New("updated application failed startup")
	}
	if e = replaceMacApplication(p.Target, p.Fresh, func(a, b string) error { return exec.Command(filepath.Join(work, "swap-helper"), a, b).Run() }, launch); e != nil {
		// Relaunch only the restored old executable. It has no pending update token.
		if name, err := macPlist(p.Target, "CFBundleExecutable"); err == nil && filepath.Base(name) == name {
			exec.Command(filepath.Join(p.Target, "Contents/MacOS", name), p.Args...).Start()
		}
		return e
	}
	return os.RemoveAll(work)
}
func macUpdateCommand(args []string) bool {
	if len(args) == 0 || args[0] != "--apply-mac-update" {
		return false
	}
	if len(args) != 2 {
		os.Exit(2)
	}
	if e := applyMacUpdate(args[1]); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	return true
}
func macUpdateRPC(r request) (any, error) {
	switch r.Method {
	case "installMacUpdate":
		var args []string
		if len(r.Args) > 5 {
			json.Unmarshal(r.Args[5], &args)
		}
		pid := number(r, 4)
		return prepareMacUpdate(str(r, 0), str(r, 1), int64(number(r, 2)), str(r, 3), pid, args)
	case "pendingMacUpdate":
		target, e := ownMacBundle()
		if e != nil {
			return nil, e
		}
		return pendingMacUpdateIn(target)
	case "completeMacUpdate":
		return nil, completeMacUpdate(str(r, 0), str(r, 1))
	}
	return nil, errors.New("unknown Mac update action")
}

func pendingMacUpdateIn(target string) (any, error) {
	entries, e := os.ReadDir(filepath.Dir(target))
	if e != nil {
		return nil, e
	}
	version, e := macPlist(target, "CFBundleShortVersionString")
	if e != nil {
		return nil, e
	}
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), ".qingtu-update-") {
			continue
		}
		file := filepath.Join(filepath.Dir(target), entry.Name(), "plan.json")
		p, e := readMacUpdatePlan(file)
		if e == nil && p.Target == target && p.Version == version {
			return map[string]string{"file": file, "token": p.Token}, nil
		}
	}
	return nil, nil
}
