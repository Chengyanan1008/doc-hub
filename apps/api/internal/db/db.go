package db

import (
	"doc-hub/api/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open 使用 PostgreSQL 打开数据库连接，并自动迁移所需表结构。
// dsn 例如：
//
//	host=localhost user=doc-hub password=doc-hub dbname=doc-hub port=5432 sslmode=disable TimeZone=UTC
//
// 或 URL 风格：
//
//	postgres://doc-hub:doc-hub@localhost:5432/doc-hub?sslmode=disable
func Open(dsn string) (*gorm.DB, error) {
	d, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}
	if err := d.AutoMigrate(
		&model.Node{},
		&model.Share{},
		&model.AISettings{},
		&model.PromptTemplate{},
		&model.MCPToken{},
		&model.User{},
	); err != nil {
		return nil, err
	}
	if err := ensureUserEmailIndex(d); err != nil {
		return nil, err
	}
	if err := model.BackfillOwnership(d); err != nil {
		return nil, err
	}
	// 兜底：内置 Prompt 模板（仅首次插入）
	model.SeedBuiltinPrompts(d)
	return d, nil
}

func ensureUserEmailIndex(d *gorm.DB) error {
	if err := d.Exec(`DROP INDEX IF EXISTS idx_users_email`).Error; err != nil {
		return err
	}
	return d.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_not_empty ON users (email) WHERE email <> '' AND deleted_at IS NULL`).Error
}
