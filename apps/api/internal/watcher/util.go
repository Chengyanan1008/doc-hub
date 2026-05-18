package watcher

import "os"

func filepathStat(p string) (os.FileInfo, error) { return os.Stat(p) }
