package main

import (
	"archive/zip"
	bytebuf "bytes"
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func extractMacArchive(data []byte, root string) error {
	z, e := zip.NewReader(bytebuf.NewReader(data), int64(len(data)))
	if e != nil {
		return e
	}
	if len(z.File) > 20000 {
		return errors.New("update archive has too many files")
	}
	seen := map[string]bool{}
	var total uint64
	for _, f := range z.File {
		name := strings.TrimSuffix(f.Name, "/")
		if name == "" || strings.Contains(name, "\\") || path.IsAbs(name) || path.Clean(name) != name || strings.ContainsRune(name, 0) {
			return errors.New("unsafe update archive path")
		}
		if !strings.HasPrefix(name, "轻图.app/") && name != "轻图.app" && name != "__MACOSX" && !strings.HasPrefix(name, "__MACOSX/") {
			return errors.New("unexpected update bundle")
		}
		if f.Mode()&os.ModeSymlink != 0 || !f.FileInfo().IsDir() && !f.Mode().IsRegular() {
			return errors.New("unsupported update archive entry")
		}
		total += f.UncompressedSize64
		if total > 500000000 {
			return errors.New("update archive too large")
		}
		key := strings.ToLower(name)
		if seen[key] {
			return errors.New("duplicate update archive entry")
		}
		seen[key] = true
		if name == "__MACOSX" || strings.HasPrefix(name, "__MACOSX/") {
			continue
		}
		target := filepath.Join(root, filepath.FromSlash(name))
		if f.FileInfo().IsDir() {
			if e = os.MkdirAll(target, 0755); e != nil {
				return e
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(target), 0755); e != nil {
			return e
		}
		in, e := f.Open()
		if e != nil {
			return e
		}
		out, e := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, f.Mode().Perm()&0777)
		if e != nil {
			in.Close()
			return e
		}
		n, copyErr := io.Copy(out, io.LimitReader(in, int64(f.UncompressedSize64)+1))
		e = errors.Join(copyErr, in.Close(), out.Close())
		if e != nil {
			return e
		}
		if uint64(n) != f.UncompressedSize64 {
			return errors.New("update entry size mismatch")
		}
	}
	return nil
}
func replaceMacApplication(target, fresh string, swap func(string, string) error, launch func(string) error) error {
	if e := swap(target, fresh); e != nil {
		return e
	}
	if e := launch(target); e != nil {
		return errors.Join(e, swap(target, fresh))
	}
	return nil
}
