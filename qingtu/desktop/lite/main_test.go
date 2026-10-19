package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func req(method string, args ...any) request {
	r := request{Method: method}
	for _, a := range args {
		b, _ := json.Marshal(a)
		r.Args = append(r.Args, b)
	}
	return r
}
func TestExclusiveAndAtomicFiles(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "project.json")
	data := base64.StdEncoding.EncodeToString([]byte("original"))
	if _, e := call(req("writeFile", p, data, "wx")); e != nil {
		t.Fatal(e)
	}
	if _, e := call(req("writeFile", p, base64.StdEncoding.EncodeToString([]byte("replacement")), "wx")); !os.IsExist(e) {
		t.Fatalf("must refuse overwrite: %v", e)
	}
	b, _ := os.ReadFile(p)
	if string(b) != "original" {
		t.Fatal("existing bytes changed")
	}
	id, e := call(req("open", p+".tmp", "wx"))
	if e != nil {
		t.Fatal(e)
	}
	for _, r := range []request{req("handleWrite", id, data), req("handleSync", id), req("handleClose", id), req("rename", p+".tmp", p)} {
		if _, e = call(r); e != nil {
			t.Fatal(e)
		}
	}
}
func TestMissingFilesKeepErrorCode(t *testing.T) {
	_, e := call(req("readFile", filepath.Join(t.TempDir(), "missing")))
	if !os.IsNotExist(e) {
		t.Fatal(e)
	}
}
func TestNativeDownloadRefusesNonHTTPS(t *testing.T) {
	if _, e := call(req("fetchText", "http://example.com")); e == nil {
		t.Fatal("accepted HTTP")
	}
}

func TestVerifiedDownloadNeverReplacesExistingBytesWithInvalidResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("verified bytes")) }))
	defer server.Close()
	prior := client
	client = server.Client()
	defer func() { client = prior }()
	root := t.TempDir()
	destination := filepath.Join(root, "installer.exe")
	os.WriteFile(destination, []byte("existing"), 0600)
	expected := sha256.Sum256([]byte("verified bytes"))
	for _, r := range []request{req("download", server.URL, destination, hex.EncodeToString(expected[:]), 2), req("download", server.URL, destination, strings.Repeat("0", 64), 14)} {
		if _, e := call(r); e == nil {
			t.Fatal("invalid download accepted")
		}
		b, _ := os.ReadFile(destination)
		if string(b) != "existing" {
			t.Fatal("existing file changed")
		}
	}
	if _, e := call(req("download", server.URL, destination, hex.EncodeToString(expected[:]), 14)); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(destination)
	if string(b) != "verified bytes" {
		t.Fatal("download corrupted")
	}
	entries, _ := os.ReadDir(root)
	if len(entries) != 1 {
		t.Fatal("temporary downloads leaked")
	}
}
