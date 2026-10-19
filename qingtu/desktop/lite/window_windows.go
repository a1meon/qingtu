//go:build windows

package main

import (
	"errors"
	"runtime"
	"syscall"
	"unsafe"
)

// Read the owner's physical work area and per-window DPI. No foreign window
// is modified: resizing still uses the authenticated Neutralino window API.
func windowMetrics(pid int) (any, error) {
	if pid <= 0 {
		return nil, errors.New("invalid window owner")
	}
	user := syscall.NewLazyDLL("user32.dll")
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	// Avoid DPI virtualization in this I/O process while reading physical bounds.
	context := user.NewProc("SetThreadDpiAwarenessContext")
	if context.Find() == nil {
		previous, _, _ := context.Call(^uintptr(2)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE (-3)
		if previous != 0 {
			defer context.Call(previous)
		}
	}
	getPID := user.NewProc("GetWindowThreadProcessId")
	getClass := user.NewProc("GetClassNameW")
	var window uintptr
	callback := syscall.NewCallback(func(hwnd, extra uintptr) uintptr {
		var owner uint32
		getPID.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == uint32(pid) {
			var name [128]uint16
			getClass.Call(hwnd, uintptr(unsafe.Pointer(&name[0])), uintptr(len(name)))
			if syscall.UTF16ToString(name[:]) == "Neutralinojs_webview" {
				window = hwnd
				return 0
			}
		}
		return 1
	})
	user.NewProc("EnumWindows").Call(callback, 0)
	if window == 0 {
		return nil, errors.New("application window not found")
	}
	monitor, _, _ := user.NewProc("MonitorFromWindow").Call(window, 2)
	type rect struct{ Left, Top, Right, Bottom int32 }
	info := struct {
		Size          uint32
		Monitor, Work rect
		Flags         uint32
	}{}
	info.Size = uint32(unsafe.Sizeof(info))
	ok, _, _ := user.NewProc("GetMonitorInfoW").Call(monitor, uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return nil, errors.New("cannot read monitor work area")
	}
	dpi := uintptr(96)
	if proc := user.NewProc("GetDpiForWindow"); proc.Find() == nil {
		if value, _, _ := proc.Call(window); value > 0 {
			dpi = value
		}
	}
	return map[string]any{"dpi": dpi, "workArea": map[string]int32{"left": info.Work.Left, "top": info.Work.Top, "right": info.Work.Right, "bottom": info.Work.Bottom}}, nil
}
