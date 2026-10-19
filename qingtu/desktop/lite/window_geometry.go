package main

import "errors"

type windowRect struct{ Left, Top, Right, Bottom int32 }

func windowCornerRadius(dpi int32, maximized bool) int32 {
	if maximized {
		return 0
	}
	if dpi < 1 {
		dpi = 96
	}
	return (12*dpi + 48) / 96
}

func resizedWindowRect(r windowRect, edge string, dx, dy, minWidth, minHeight int32) (windowRect, error) {
	switch edge {
	case "n", "s", "e", "w", "nw", "ne", "sw", "se":
	default:
		return r, errors.New("invalid resize edge")
	}
	for _, side := range edge {
		switch side {
		case 'w':
			r.Left = min(r.Left+dx, r.Right-minWidth)
		case 'e':
			r.Right = max(r.Right+dx, r.Left+minWidth)
		case 'n':
			r.Top = min(r.Top+dy, r.Bottom-minHeight)
		case 's':
			r.Bottom = max(r.Bottom+dy, r.Top+minHeight)
		}
	}
	return r, nil
}
