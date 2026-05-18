package db

import (
	"github.com/xiaofengguo/web-doc/api/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open 使用 PostgreSQL 打开数据库连接，并自动迁移所需表结构。
// dsn 例如：
//   host=localhost user=webdoc password=webdoc dbname=webdoc port=5432 sslmode=disable TimeZone=UTC
// 或 URL 风格：
//   postgres://webdoc:webdoc@localhost:5432/webdoc?sslmode=disable
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
	// 兜底：内置 Prompt 模板（仅首次插入）
	model.SeedBuiltinPrompts(d)
	return d, nil
}
