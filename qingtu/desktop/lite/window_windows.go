//go:build windows

package main

import (
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

var windowUser = syscall.NewLazyDLL("user32.dll")

type windowSearch struct {
	pid    uint32
	window uintptr
}

// Go retains native callbacks for the lifetime of the helper. Reuse one callback
// with a synchronous per-call search record instead of allocating one per drag.
var enumerateOwnedWindow = syscall.NewCallback(func(hwnd, extra uintptr) uintptr {
	search := (*windowSearch)(unsafe.Pointer(extra))
	var owner uint32
	windowUser.NewProc("GetWindowThreadProcessId").Call(hwnd, uintptr(unsafe.Pointer(&owner)))
	if owner == search.pid {
		var name [128]uint16
		windowUser.NewProc("GetClassNameW").Call(hwnd, uintptr(unsafe.Pointer(&name[0])), uintptr(len(name)))
		if syscall.UTF16ToString(name[:]) == "Neutralinojs_webview" {
			search.window = hwnd
			return 0
		}
	}
	return 1
})

func physicalWindowThread() func() {
	runtime.LockOSThread()
	context := windowUser.NewProc("SetThreadDpiAwarenessContext")
	previous := uintptr(0)
	if context.Find() == nil {
		previous, _, _ = context.Call(^uintptr(2))
	}
	return func() {
		if previous != 0 {
			context.Call(previous)
		}
		runtime.UnlockOSThread()
	}
}

// Only the PID/class explicitly supplied by the authenticated local client.
func ownedWindow(pid int) (uintptr, error) {
	if pid <= 0 {
		return 0, errors.New("invalid window owner")
	}
	search := windowSearch{pid: uint32(pid)}
	windowUser.NewProc("EnumWindows").Call(enumerateOwnedWindow, uintptr(unsafe.Pointer(&search)))
	runtime.KeepAlive(&search)
	if search.window == 0 {
		return 0, errors.New("application window not found")
	}
	return search.window, nil
}

func windowWorkArea(window uintptr) (windowRect, error) {
	user := windowUser
	monitor, _, _ := user.NewProc("MonitorFromWindow").Call(window, 2)
	info := struct {
		Size          uint32
		Monitor, Work windowRect
		Flags         uint32
	}{}
	info.Size = uint32(unsafe.Sizeof(info))
	ok, _, _ := user.NewProc("GetMonitorInfoW").Call(monitor, uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return windowRect{}, errors.New("cannot read monitor work area")
	}
	return info.Work, nil
}

func windowDPI(window uintptr) int32 {
	dpi := uintptr(96)
	if proc := windowUser.NewProc("GetDpiForWindow"); proc.Find() == nil {
		if value, _, _ := proc.Call(window); value > 0 {
			dpi = value
		}
	}
	return int32(dpi)
}

func windowMetrics(pid int) (any, error) {
	defer physicalWindowThread()()
	window, err := ownedWindow(pid)
	if err != nil {
		return nil, err
	}
	work, err := windowWorkArea(window)
	if err != nil {
		return nil, err
	}
	return map[string]any{"dpi": windowDPI(window), "workArea": map[string]int32{"left": work.Left, "top": work.Top, "right": work.Right, "bottom": work.Bottom}}, nil
}

type windowShape struct {
	width, height, dpi int32
	maximized          bool
}
type windowChromeState struct {
	mu       sync.Mutex
	shape    windowShape
	resizing atomic.Bool
}

var chromeWindows sync.Map

func windowBounds(hwnd uintptr) (windowRect, error) {
	var r windowRect
	ok, _, _ := windowUser.NewProc("GetWindowRect").Call(hwnd, uintptr(unsafe.Pointer(&r)))
	if ok == 0 {
		return r, errors.New("cannot read application window")
	}
	return r, nil
}

func positionWindow(hwnd uintptr, r windowRect) error {
	ok, _, err := windowUser.NewProc("SetWindowPos").Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), 0x14) // no Z-order or activation
	if ok == 0 {
		return err
	}
	return nil
}

// A real window region clips the host itself on Windows 10 and 11. CSS alone
// would leave opaque square corners outside the rounded page. No layered window
// or global system setting is used. Windows owns each successfully assigned HRGN.
func (state *windowChromeState) syncShape(hwnd uintptr) error {
	state.mu.Lock()
	defer state.mu.Unlock()
	iconic, _, _ := windowUser.NewProc("IsIconic").Call(hwnd)
	if iconic != 0 {
		return nil
	}
	r, err := windowBounds(hwnd)
	if err != nil {
		return err
	}
	zoomed, _, _ := windowUser.NewProc("IsZoomed").Call(hwnd)
	if zoomed != 0 {
		work, e := windowWorkArea(hwnd)
		if e != nil {
			return e
		}
		if r != work {
			if e = positionWindow(hwnd, work); e != nil {
				return e
			}
			r = work
		}
	}
	shape := windowShape{r.Right - r.Left, r.Bottom - r.Top, windowDPI(hwnd), zoomed != 0}
	if shape == state.shape || shape.width < 1 || shape.height < 1 {
		return nil
	}
	var region uintptr
	if radius := windowCornerRadius(shape.dpi, shape.maximized); radius > 0 {
		region, _, _ = syscall.NewLazyDLL("gdi32.dll").NewProc("CreateRoundRectRgn").Call(0, 0, uintptr(shape.width+1), uintptr(shape.height+1), uintptr(radius*2), uintptr(radius*2))
		if region == 0 {
			return errors.New("cannot create rounded window region")
		}
	}
	ok, _, _ := windowUser.NewProc("SetWindowRgn").Call(hwnd, region, 1)
	if ok == 0 {
		if region != 0 {
			syscall.NewLazyDLL("gdi32.dll").NewProc("DeleteObject").Call(region)
		}
		return errors.New("cannot set rounded window region")
	}
	state.shape = shape
	return nil
}

func configureWindowChrome(pid int) (any, error) {
	defer physicalWindowThread()()
	hwnd, err := ownedWindow(pid)
	if err != nil {
		return nil, err
	}
	// setSize() in the stock SDK re-adds WS_THICKFRAME. Remove both non-client
	// frame styles after initial fitting; our explicit edge handles resize it.
	style, _, _ := windowUser.NewProc("GetWindowLongW").Call(hwnd, ^uintptr(15)) // GWL_STYLE -16
	windowUser.NewProc("SetWindowLongW").Call(hwnd, ^uintptr(15), style&^uintptr(0x00C40000))
	windowUser.NewProc("SetWindowPos").Call(hwnd, 0, 0, 0, 0, 0, 0x37) // frame changed, no size/move/activation/Z change
	value, loaded := chromeWindows.LoadOrStore(hwnd, &windowChromeState{})
	state := value.(*windowChromeState)
	if err = state.syncShape(hwnd); err != nil {
		chromeWindows.Delete(hwnd)
		return nil, err
	}
	if !loaded {
		go func() {
			defer physicalWindowThread()()
			defer chromeWindows.Delete(hwnd)
			ticker := time.NewTicker(50 * time.Millisecond)
			defer ticker.Stop()
			for range ticker.C {
				var owner uint32
				windowUser.NewProc("GetWindowThreadProcessId").Call(hwnd, uintptr(unsafe.Pointer(&owner)))
				if owner != uint32(pid) {
					return
				}
				_ = state.syncShape(hwnd)
			}
		}()
	}
	return map[string]any{"rounded": true, "borderless": true}, nil
}

func beginWindowResize(pid int, edge string) (any, error) {
	if _, err := resizedWindowRect(windowRect{}, edge, 0, 0, 1, 1); err != nil {
		return nil, err
	}
	defer physicalWindowThread()()
	hwnd, err := ownedWindow(pid)
	if err != nil {
		return nil, err
	}
	value, ok := chromeWindows.Load(hwnd)
	if !ok {
		return nil, errors.New("window chrome is not ready")
	}
	state := value.(*windowChromeState)
	zoomed, _, _ := windowUser.NewProc("IsZoomed").Call(hwnd)
	if zoomed != 0 {
		return false, nil
	}
	r, err := windowBounds(hwnd)
	if err != nil {
		return nil, err
	}
	var start struct{ X, Y int32 }
	if ok, _, _ := windowUser.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&start))); ok == 0 {
		return nil, errors.New("cannot read pointer position")
	}
	if !state.resizing.CompareAndSwap(false, true) {
		return false, nil
	}
	go func() {
		defer physicalWindowThread()()
		defer state.resizing.Store(false)
		button := uintptr(1)
		swapped, _, _ := windowUser.NewProc("GetSystemMetrics").Call(23)
		if swapped != 0 {
			button = 2
		}
		for {
			pressed, _, _ := windowUser.NewProc("GetAsyncKeyState").Call(button)
			if pressed&0x8000 == 0 {
				return
			}
			escaped, _, _ := windowUser.NewProc("GetAsyncKeyState").Call(27)
			if escaped&0x8000 != 0 {
				_ = positionWindow(hwnd, r)
				_ = state.syncShape(hwnd)
				return
			}
			var point struct{ X, Y int32 }
			if ok, _, _ := windowUser.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&point))); ok == 0 {
				return
			}
			dpi := windowDPI(hwnd)
			work, e := windowWorkArea(hwnd)
			if e != nil {
				return
			}
			next, _ := resizedWindowRect(r, edge, point.X-start.X, point.Y-start.Y, min(600*dpi/96, work.Right-work.Left-32*dpi/96), min(420*dpi/96, work.Bottom-work.Top-32*dpi/96))
			if e = positionWindow(hwnd, next); e != nil {
				return
			}
			if e = state.syncShape(hwnd); e != nil {
				return
			}
			time.Sleep(16 * time.Millisecond)
		}
	}()
	return true, nil
}
