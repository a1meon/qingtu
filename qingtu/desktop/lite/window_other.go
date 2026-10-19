//go:build !windows

package main

import "errors"

func windowMetrics(pid int) (any, error) {
	return nil, errors.New("native Windows metrics are unavailable")
}
