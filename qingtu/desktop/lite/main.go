// Qingtu's small native I/O companion. Image processing stays in the WebView
// worker. Files use exclusive creation and durable sync, as in the Node engine.
package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

type request struct {
	ID     int               `json:"id"`
	Method string            `json:"method"`
	Args   []json.RawMessage `json:"args"`
}

var handles = map[int]*os.File{}
var sequence int

func str(r request, i int) string {
	var s string
	if i < len(r.Args) {
		json.Unmarshal(r.Args[i], &s)
	}
	return s
}
func boolean(r request, i int) bool {
	var b bool
	if i < len(r.Args) {
		json.Unmarshal(r.Args[i], &b)
	}
	return b
}
func number(r request, i int) int {
	var n int
	if i < len(r.Args) {
		json.Unmarshal(r.Args[i], &n)
	}
	return n
}
func bytes(r request, i int) ([]byte, error) { return base64.StdEncoding.DecodeString(str(r, i)) }

var client = &http.Client{Timeout: 120 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
	if len(via) > 5 || req.URL.Scheme != "https" {
		return errors.New("invalid redirect")
	}
	return nil
}}

func remote(raw string) (*http.Response, error) {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil {
		return nil, errors.New("invalid HTTPS URL")
	}
	req, e := http.NewRequest("GET", raw, nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("User-Agent", "Qingtu-Lightweight")
	response, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	if response.StatusCode != 200 {
		response.Body.Close()
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	return response, nil
}
func call(r request) (any, error) {
	p := str(r, 0)
	switch r.Method {
	case "fetchText":
		response, e := remote(p)
		if e != nil {
			return nil, e
		}
		defer response.Body.Close()
		b, e := io.ReadAll(io.LimitReader(response.Body, 1024*1024+1))
		if len(b) > 1024*1024 {
			return nil, errors.New("response too large")
		}
		return string(b), e
	case "download":
		response, e := remote(p)
		if e != nil {
			return nil, e
		}
		defer response.Body.Close()
		destination := str(r, 1)
		expected := number(r, 3)
		if expected < 1 || expected > 300000000 {
			return nil, errors.New("invalid download size")
		}
		if e = os.MkdirAll(filepath.Dir(destination), 0700); e != nil {
			return nil, e
		}
		f, e := os.CreateTemp(filepath.Dir(destination), "qingtu-update-*.partial")
		if e != nil {
			return nil, e
		}
		temporary := f.Name()
		defer os.Remove(temporary)
		hash := sha256.New()
		count, e := io.Copy(io.MultiWriter(f, hash), io.LimitReader(response.Body, int64(expected)+1))
		if e == nil {
			e = f.Sync()
		}
		f.Close()
		if e != nil {
			return nil, e
		}
		if count != int64(expected) || hex.EncodeToString(hash.Sum(nil)) != str(r, 2) {
			return nil, errors.New("download verification failed")
		}
		if e = os.Rename(temporary, destination); e != nil {
			return nil, e
		}
		return destination, nil
	case "platform":
		return map[string]any{"os": runtime.GOOS, "arch": runtime.GOARCH}, nil
	case "readFile":
		b, e := os.ReadFile(p)
		return base64.StdEncoding.EncodeToString(b), e
	case "writeFile":
		b, e := bytes(r, 1)
		if e != nil {
			return nil, e
		}
		flags := os.O_WRONLY | os.O_CREATE
		if str(r, 2) == "wx" {
			flags |= os.O_EXCL
		} else {
			flags |= os.O_TRUNC
		}
		f, e := os.OpenFile(p, flags, 0600)
		if e != nil {
			return nil, e
		}
		defer f.Close()
		if _, e = f.Write(b); e != nil {
			return nil, e
		}
		return nil, f.Sync()
	case "mkdir":
		return nil, os.MkdirAll(p, 0700)
	case "access":
		_, e := os.Stat(p)
		return nil, e
	case "stat":
		s, e := os.Stat(p)
		if e != nil {
			return nil, e
		}
		return map[string]any{"size": s.Size(), "isDirectory": s.IsDir()}, nil
	case "readdir":
		entries, e := os.ReadDir(p)
		if e != nil {
			return nil, e
		}
		names := []string{}
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		return names, nil
	case "rm":
		e := os.Remove(p)
		if boolean(r, 1) && os.IsNotExist(e) {
			e = nil
		}
		return nil, e
	case "rename":
		return nil, os.Rename(p, str(r, 1))
	case "open":
		flags := os.O_RDONLY
		if str(r, 1) == "wx" {
			flags = os.O_WRONLY | os.O_CREATE | os.O_EXCL
		}
		f, e := os.OpenFile(p, flags, 0600)
		if e != nil {
			return nil, e
		}
		sequence++
		handles[sequence] = f
		return sequence, nil
	case "handleWrite", "handleSync", "handleClose":
		id := number(r, 0)
		f := handles[id]
		if f == nil {
			return nil, errors.New("invalid file handle")
		}
		if r.Method == "handleClose" {
			delete(handles, id)
			return nil, f.Close()
		}
		if r.Method == "handleSync" {
			return nil, f.Sync()
		}
		b, e := bytes(r, 1)
		if e != nil {
			return nil, e
		}
		_, e = f.Write(b)
		return nil, e
	case "legacyRoot":
		h, e := os.UserHomeDir()
		if e != nil {
			return nil, e
		}
		if runtime.GOOS == "darwin" {
			return filepath.Join(h, "Library", "Application Support", "qingtu", "stitch-projects"), nil
		}
		return filepath.Join(os.Getenv("APPDATA"), "qingtu", "stitch-projects"), nil
	}
	return nil, fmt.Errorf("unsupported native operation: %s", r.Method)
}
func main() {
	if installCommand(os.Args[1:]) {
		return
	}
	defer func() {
		for _, f := range handles {
			f.Close()
		}
	}()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 65536), 200*1024*1024)
	out := bufio.NewWriter(os.Stdout)
	var outputLock sync.Mutex
	var network sync.WaitGroup
	respond := func(r request) {
		result, e := call(r)
		response := map[string]any{"id": r.ID, "result": result}
		if e != nil {
			code := "EIO"
			if os.IsNotExist(e) {
				code = "ENOENT"
			}
			if os.IsExist(e) {
				code = "EEXIST"
			}
			response["error"] = map[string]string{"message": e.Error(), "code": code}
		}
		b, _ := json.Marshal(response)
		outputLock.Lock()
		out.Write(b)
		out.WriteByte('\n')
		out.Flush()
		outputLock.Unlock()
	}
	for scanner.Scan() {
		var r request
		if e := json.Unmarshal(scanner.Bytes(), &r); e != nil {
			continue
		}
		if r.Method == "fetchText" || r.Method == "download" {
			network.Add(1)
			go func(r request) { defer network.Done(); respond(r) }(r)
		} else {
			respond(r)
		}
	}
	network.Wait()
	if e := scanner.Err(); e != nil && !errors.Is(e, io.EOF) {
		fmt.Fprintln(os.Stderr, e)
	}
}
