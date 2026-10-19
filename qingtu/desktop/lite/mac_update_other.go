//go:build !darwin

package main

import "errors"

func macUpdateCommand(args []string) bool { return false }
func macUpdateRPC(r request) (any, error) {
	return nil, errors.New("Mac updates are not available on this platform")
}
