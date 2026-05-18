package handler

import "os"

func readFileSafe(p string) ([]byte, error) { return os.ReadFile(p) }
