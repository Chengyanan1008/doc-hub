package config

import (
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Addr            string
	StorageDir      string
	DSN             string
	WebRoot         string
	MaxUploadMB     int64
	AllowOrigin     string
	JWTSecret       string
	DisableRegister bool
	ShareTTLHours   int
}

func Load() *Config {
	storage := getEnv("DOC_HUB_STORAGE", filepath.Join("..", "..", "storage", "docs"))
	abs, _ := filepath.Abs(storage)

	return &Config{
		Addr:            getEnv("DOC_HUB_ADDR", ":8787"),
		StorageDir:      abs,
		DSN:             buildDSN(),
		WebRoot:         getEnv("DOC_HUB_WEB_ROOT", ""),
		MaxUploadMB:     50,
		AllowOrigin:     getEnv("DOC_HUB_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,http://127.0.0.1:8787"),
		JWTSecret:       getEnv("DOC_HUB_JWT_SECRET", "doc-hub-default-secret-please-change"),
		DisableRegister: getEnv("DOC_HUB_DISABLE_REGISTER", "1") == "1",
		ShareTTLHours:   intFromEnv("DOC_HUB_SHARE_TTL_HOURS", 24*30),
	}
}

// buildDSN 优先使用 DOC_HUB_DSN；否则根据 PG* 环境变量组装。
func buildDSN() string {
	if dsn := getEnv("DOC_HUB_DSN", ""); dsn != "" {
		return dsn
	}
	host := getEnv("DOC_HUB_PG_HOST", "127.0.0.1")
	port := getEnv("DOC_HUB_PG_PORT", "5432")
	user := getEnv("DOC_HUB_PG_USER", "doc-hub")
	pass := getEnv("DOC_HUB_PG_PASSWORD", "doc-hub")
	name := getEnv("DOC_HUB_PG_DB", "doc-hub")
	ssl := getEnv("DOC_HUB_PG_SSLMODE", "disable")
	tz := getEnv("DOC_HUB_PG_TZ", "UTC")
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		host, port, user, pass, name, ssl, tz)
}

func getEnv(key string, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func intFromEnv(key string, def int) int {
	var v int
	if _, err := fmt.Sscanf(os.Getenv(key), "%d", &v); err == nil && v > 0 {
		return v
	}
	return def
}
