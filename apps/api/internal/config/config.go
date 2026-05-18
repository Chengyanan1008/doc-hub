package config

import (
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Addr             string
	StorageDir       string
	DSN              string
	WebRoot          string
	MaxUploadMB      int64
	AllowOrigin      string
	JWTSecret        string
	DisableRegister  bool
}

func Load() *Config {
	storage := getEnv("WEBDOC_STORAGE", filepath.Join("..", "..", "storage", "docs"))
	abs, _ := filepath.Abs(storage)

	return &Config{
		Addr:            getEnv("WEBDOC_ADDR", ":8787"),
		StorageDir:      abs,
		DSN:             buildDSN(),
		WebRoot:         getEnv("WEBDOC_WEB_ROOT", ""),
		MaxUploadMB:     50,
		AllowOrigin:     getEnv("WEBDOC_ORIGIN", "*"),
		JWTSecret:       getEnv("WEBDOC_JWT_SECRET", "webdoc-default-secret-please-change"),
		DisableRegister: getEnv("WEBDOC_DISABLE_REGISTER", "") == "1",
	}
}

// buildDSN 优先使用 WEBDOC_DSN；否则根据 PG* 环境变量组装。
func buildDSN() string {
	if dsn := os.Getenv("WEBDOC_DSN"); dsn != "" {
		return dsn
	}
	host := getEnv("WEBDOC_PG_HOST", "127.0.0.1")
	port := getEnv("WEBDOC_PG_PORT", "5432")
	user := getEnv("WEBDOC_PG_USER", "webdoc")
	pass := getEnv("WEBDOC_PG_PASSWORD", "webdoc")
	name := getEnv("WEBDOC_PG_DB", "webdoc")
	ssl := getEnv("WEBDOC_PG_SSLMODE", "disable")
	tz := getEnv("WEBDOC_PG_TZ", "UTC")
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		host, port, user, pass, name, ssl, tz)
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
