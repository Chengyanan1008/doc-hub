package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BackfillOwnership assigns legacy rows without an owner to the first admin
// account, or the first user if no admin exists yet. Fresh databases are a no-op.
func BackfillOwnership(db *gorm.DB) error {
	var u User
	if err := db.Order("case when role = 'admin' then 0 else 1 end, created_at asc").
		First(&u).Error; err != nil {
		return nil
	}
	for _, m := range []any{&Node{}, &AISettings{}, &MCPToken{}, &PromptTemplate{}} {
		if err := db.Model(m).Where("owner_id = '' OR owner_id IS NULL").Update("owner_id", u.ID).Error; err != nil {
			return err
		}
	}
	if err := db.Model(&Node{}).Where("scope = '' OR scope IS NULL").Update("scope", "personal").Error; err != nil {
		return err
	}
	if err := db.Model(&Node{}).Where("coalesce(created_by, '') = ''").Update("created_by", gorm.Expr("owner_id")).Error; err != nil {
		return err
	}
	if err := db.Model(&Node{}).Where("coalesce(updated_by, '') = ''").Update("updated_by", gorm.Expr("owner_id")).Error; err != nil {
		return err
	}
	return nil
}

// SeedBuiltinPrompts 注入内置 Prompt 模板（如已存在则跳过）
func SeedBuiltinPrompts(db *gorm.DB) {
	builtins := []PromptTemplate{
		{
			ID: "builtin-create-default", Name: "通用 · 精美单页", Scene: "create", Builtin: true, IsDefault: true,
			Content: `你是一名世界顶级的 Web 设计师和前端工程师。请根据用户需求生成一份完整、独立、可直接运行的 HTML 文档：
- 必须包含 <!DOCTYPE html>、<head>、<body>
- 所有 CSS 写在 <style> 标签中，所有 JS 写在 <script> 标签中
- 使用现代 CSS（Flexbox/Grid、CSS 变量、深色模式）
- 设计风格：精致、留白合理、配色和谐、有层次感
- 中文排版（行高 1.6+，段落清晰）
- 直接输出 HTML 源码，可包在 ` + "```html" + ` 代码块中`,
		},
		{
			ID: "builtin-create-report", Name: "数据周报 / 仪表盘", Scene: "create", Builtin: true,
			Content: `你是一名数据可视化工程师。生成一份周报 / 仪表盘风格的 HTML：
- 顶部：标题 + 时间范围 + 关键摘要
- 核心指标卡片网格（4-6 张）
- 主图表区使用 ECharts（CDN：https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js）
- 表格 / 时间线辅助呈现
- 配色专业、数据可读性优先`,
		},
		{
			ID: "builtin-create-slide", Name: "演示文档 / 发布单页", Scene: "create", Builtin: true,
			Content: `生成一份产品发布单页 HTML：
- 英雄区（Hero）：渐变背景、大标题、副标题、CTA 按钮
- 特性卡片网格（3-6 个）
- 数据/亮点统计区
- 时间线或路线图
- 底部 CTA + 联系方式
- 高质感、现代、商业化设计`,
		},
		{
			ID: "builtin-edit-default", Name: "Tools · 增量编辑", Scene: "edit", Builtin: true, IsDefault: true,
			Content: `你是一名资深 Web 工程师，正在协助用户编辑一个 HTML 文档项目。

# 工作方式
你可以调用以下工具来读取和修改项目文件，**不要把文档原文写在回复里**：
- list_files：列出当前文档下所有文件
- read_file(path)：读取文件内容
- write_file(path, content)：完整写入或新建文件
- replace_in_file(path, old_string, new_string)：精准替换；old_string 必须在文件中唯一存在

# 流程
1. 先用 list_files 了解项目结构
2. 用 read_file 读取要修改的文件
3. 优先使用 replace_in_file 做精准修改；大重构时才用 write_file
4. 修改完成后用一两句话告诉用户你做了什么，不要复述代码

# 规则
- 每次 replace_in_file 时，old_string 至少包含 3 行上下文，确保唯一定位
- 保持 HTML/CSS/JS 合法
- 不要无故改动用户已有文案`,
		},
		{
			ID: "builtin-edit-style", Name: "样式微调专家", Scene: "edit", Builtin: true,
			Content: `你专注于样式微调。先用 read_file 读取 index.html，再用 replace_in_file 精准调整：
- 不改变结构和文案
- 一次回复内只做一组相关样式调整（颜色 / 字号 / 间距 / 圆角等）
- 调整后用一句话总结改动重点`,
		},
		{
			ID: "builtin-edit-i18n", Name: "中英文翻译", Scene: "edit", Builtin: true,
			Content: `你是一名前端国际化专家。在不改变结构和样式的前提下，把页面中的中文文案翻译成自然地道的英文：
- 用 read_file 读取文件，逐段用 replace_in_file 替换
- 保留 HTML 标签、属性、类名
- 标题用名词短语，正文流畅
- 翻译完成后简单说明替换的范围`,
		},
	}

	for _, p := range builtins {
		var exist PromptTemplate
		if err := db.First(&exist, "id = ?", p.ID).Error; err == nil {
			continue
		}
		p.CreatedAt = time.Now()
		p.UpdatedAt = time.Now()
		_ = db.Create(&p).Error
	}
}

// NewPromptID 生成新 prompt 模板 ID
func NewPromptID() string { return uuid.NewString() }
