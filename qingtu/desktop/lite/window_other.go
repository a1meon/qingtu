//go:build !windows

package main

import "errors"

func windowMetrics(pid int) (any, error) {
	return nil, errors.New("native Windows metrics are unavailable")
}
func configureWindowChrome(pid int) (any, error) {
	return nil, errors.New("native Windows chrome is unavailable")
}
func beginWindowResize(pid int, edge string) (any, error) {
	return nil, errors.New("native Windows resizing is unavailable")
}
