//go:build windows

package main

import (
	"os"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

// This fixture is never shown or focused. Run on a Windows host to verify the
// actual host styles and native corner region, in addition to geometry tests.
func hiddenChromeWindow(t *testing.T) uintptr {
	t.Helper()
	type result struct {
		hwnd uintptr
		err  error
	}
	created, stopped := make(chan result, 1), make(chan struct{})
	go func() {
		defer close(stopped)
		defer physicalWindowThread()()
		name, _ := syscall.UTF16PtrFromString("Neutralinojs_webview")
		instance, _, _ := syscall.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW").Call(0)
		type windowClass struct {
			Size, Style                        uint32
			Procedure                          uintptr
			ClassExtra, WindowExtra            int32
			Instance, Icon, Cursor, Background uintptr
			MenuName, ClassName                *uint16
			SmallIcon                          uintptr
		}
		definition := windowClass{Instance: instance, ClassName: name}
		definition.Size = uint32(unsafe.Sizeof(definition))
		definition.Procedure = syscall.NewCallback(func(h uintptr, m uint32, w, l uintptr) uintptr {
			if m == 2 {
				windowUser.NewProc("PostQuitMessage").Call(0)
			} // WM_DESTROY
			v, _, _ := windowUser.NewProc("DefWindowProcW").Call(h, uintptr(m), w, l)
			return v
		})
		atom, _, err := windowUser.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&definition)))
		if atom == 0 {
			created <- result{err: err}
			return
		}
		defer windowUser.NewProc("UnregisterClassW").Call(uintptr(unsafe.Pointer(name)), instance)
		outside := int32(-32000)
		hwnd, _, err := windowUser.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), 0x00CF0000, uintptr(outside), uintptr(outside), 800, 600, 0, 0, instance, 0)
		if hwnd == 0 {
			created <- result{err: err}
			return
		}
		defer windowUser.NewProc("DestroyWindow").Call(hwnd)
		created <- result{hwnd: hwnd}
		// The owner thread must dispatch cross-thread window messages while the test
		// thread and background rounder call synchronous SetWindowPos/SetWindowRgn.
		var message struct {
			Window         uintptr
			Message        uint32
			WParam, LParam uintptr
			Time           uint32
			Point          struct{ X, Y int32 }
			Private        uint32
		}
		for {
			value, _, _ := windowUser.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
			if int32(value) <= 0 {
				return
			}
			windowUser.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
		}
	}()
	value := <-created
	if value.err != nil {
		t.Fatal(value.err)
	}
	t.Cleanup(func() {
		windowUser.NewProc("PostMessageW").Call(value.hwnd, 0x10, 0, 0)
		select {
		case <-stopped:
		case <-time.After(3 * time.Second):
			t.Error("hidden window owner failed to stop")
		}
	})
	return value.hwnd
}

func TestHiddenNativeWindowChrome(t *testing.T) {
	defer physicalWindowThread()()
	hwnd := hiddenChromeWindow(t)
	outside := int32(-32000)
	var err error
	if _, err = configureWindowChrome(os.Getpid()); err != nil {
		t.Fatal(err)
	}
	// A capturing NewCallback per lookup exhausts Go's finite trampoline table.
	for i := 0; i < 10000; i++ {
		if found, e := ownedWindow(os.Getpid()); e != nil || found != hwnd {
			t.Fatalf("window lookup %d: %v", i, e)
		}
	}
	style, _, _ := windowUser.NewProc("GetWindowLongW").Call(hwnd, ^uintptr(15))
	if style&0x00C40000 != 0 {
		t.Fatalf("native caption/frame remains: %x", style)
	}
	if visible, _, _ := windowUser.NewProc("IsWindowVisible").Call(hwnd); visible != 0 {
		t.Fatal("test window became visible")
	}
	value, _ := chromeWindows.Load(hwnd)
	state := value.(*windowChromeState)
	check := func(width, height int32) {
		t.Helper()
		if err := positionWindow(hwnd, windowRect{outside, outside, outside + width, outside + height}); err != nil {
			t.Fatal(err)
		}
		if err := state.syncShape(hwnd); err != nil {
			t.Fatal(err)
		}
		gdi := syscall.NewLazyDLL("gdi32.dll")
		region, _, _ := gdi.NewProc("CreateRectRgn").Call(0, 0, 0, 0)
		defer gdi.NewProc("DeleteObject").Call(region)
		if kind, _, _ := windowUser.NewProc("GetWindowRgn").Call(hwnd, region); kind == 0 {
			t.Fatal("host has no rounded region")
		}
		if inside, _, _ := gdi.NewProc("PtInRegion").Call(region, 0, 0); inside != 0 {
			t.Fatal("opaque square top-left corner remains")
		}
		if inside, _, _ := gdi.NewProc("PtInRegion").Call(region, uintptr(width-30), uintptr(height-30)); inside == 0 {
			t.Fatal("region did not grow with host")
		}
	}
	check(800, 600)
	check(1000, 700)
}
