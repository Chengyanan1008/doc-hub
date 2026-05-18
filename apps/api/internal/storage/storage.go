package storage

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// 允许的文件后缀
var allowedExt = map[string]bool{
	".html": true, ".htm": true, ".css": true, ".js": true, ".mjs": true,
	".json": true, ".txt": true, ".md": true, ".svg": true, ".png": true,
	".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".ico": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
	".mp3": true, ".mp4": true, ".webm": true, ".wasm": true, ".map": true,
	".xml": true, ".csv": true,
}

type Storage struct {
	Root string
}

func New(root string) (*Storage, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &Storage{Root: root}, nil
}

// DocPath 返回文档目录绝对路径
func (s *Storage) DocPath(docID string) string {
	return filepath.Join(s.Root, docID)
}

// ResolveSafe 把请求的子路径安全地拼到文档目录，并防止路径穿越
func (s *Storage) ResolveSafe(docID, sub string) (string, error) {
	base := s.DocPath(docID)
	if sub == "" || sub == "/" {
		sub = "index.html"
	}
	clean := filepath.Clean("/" + sub) // 强制为绝对，再去掉前导斜杠
	clean = strings.TrimPrefix(clean, string(filepath.Separator))
	full := filepath.Join(base, clean)
	rel, err := filepath.Rel(base, full)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", errors.New("invalid path")
	}
	return full, nil
}

// CreateDoc 创建一个空文档目录，并写入默认 index.html
func (s *Storage) CreateDoc(docID, html string) error {
	dir := s.DocPath(docID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if html == "" {
		html = defaultIndexHTML
	}
	return os.WriteFile(filepath.Join(dir, "index.html"), []byte(html), 0o644)
}

// WriteFile 在文档下写入一个文件（带安全校验）
func (s *Storage) WriteFile(docID, sub string, data []byte) error {
	if !checkExt(sub) {
		return fmt.Errorf("file extension not allowed: %s", sub)
	}
	full, err := s.ResolveSafe(docID, sub)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, data, 0o644)
}

// ExtractZip 解压 zip 到文档目录（带白名单与穿越保护）。
// 返回值 hasIndex 指示解压后顶层是否存在 index.html。
func (s *Storage) ExtractZip(docID string, r io.ReaderAt, size int64) (bool, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return false, err
	}
	dir := s.DocPath(docID)
	// 清空旧目录：上传 zip 的语义是“整体替换”，避免之前默认创建的 index.html 残留
	if err := os.RemoveAll(dir); err != nil {
		return false, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, err
	}
	hasIndex := false
	for _, f := range zr.File {
		// 跳过 macOS 元数据
		if strings.HasPrefix(f.Name, "__MACOSX/") || strings.HasSuffix(f.Name, ".DS_Store") {
			continue
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if !checkExt(f.Name) {
			continue
		}
		full, err := s.ResolveSafe(docID, f.Name)
		if err != nil {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return false, err
		}
		rc, err := f.Open()
		if err != nil {
			return false, err
		}
		out, err := os.Create(full)
		if err != nil {
			rc.Close()
			return false, err
		}
		if _, err := io.Copy(out, rc); err != nil {
			rc.Close()
			out.Close()
			return false, err
		}
		rc.Close()
		out.Close()
		// 仅顶层 index.html 视作已有入口（子目录的不算）
		lowName := strings.ToLower(filepath.ToSlash(f.Name))
		if lowName == "index.html" || lowName == "./index.html" {
			hasIndex = true
		}
	}
	return hasIndex, nil
}

// FileExists 判断文档目录下某个相对路径文件是否存在
func (s *Storage) FileExists(docID, sub string) bool {
	full, err := s.ResolveSafe(docID, sub)
	if err != nil {
		return false
	}
	info, err := os.Stat(full)
	return err == nil && !info.IsDir()
}

// RemoveDoc 删除整个文档目录
func (s *Storage) RemoveDoc(docID string) error {
	return os.RemoveAll(s.DocPath(docID))
}

// DocSize 计算文档目录总大小
func (s *Storage) DocSize(docID string) int64 {
	var size int64
	_ = filepath.Walk(s.DocPath(docID), func(_ string, info os.FileInfo, err error) error {
		if err == nil && info != nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

// ListFiles 列出文档下所有文件相对路径
func (s *Storage) ListFiles(docID string) ([]string, error) {
	var out []string
	base := s.DocPath(docID)
	err := filepath.Walk(base, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(base, p)
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	return out, err
}

func checkExt(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return false
	}
	return allowedExt[ext]
}

const defaultIndexHTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>新文档</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0;
         background: linear-gradient(135deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }
  .card { text-align:center; padding:48px; border-radius:16px;
          background:rgba(255,255,255,0.05); backdrop-filter:blur(10px);
          border:1px solid rgba(255,255,255,0.1); }
  h1 { margin:0 0 12px; font-size:32px; background:linear-gradient(90deg,#60a5fa,#a78bfa);
       -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  p { margin:0; opacity:.7; }
</style>
</head>
<body>
  <div class="card">
    <h1>✨ 新文档已创建</h1>
    <p>编辑此文件以开始你的创作</p>
  </div>
</body>
</html>
`
