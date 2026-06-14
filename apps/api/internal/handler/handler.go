package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"doc-hub/api/internal/model"
	"doc-hub/api/internal/storage"
	"doc-hub/api/internal/watcher"
	"gorm.io/gorm"
)

const docLockTTL = 45 * time.Second

type Handler struct {
	DB              *gorm.DB
	Storage         *storage.Storage
	Hub             *watcher.Hub
	JWTSecret       string
	DisableRegister bool
	ShareTTLHours   int

	wsUpgrader websocket.Upgrader
}

func New(db *gorm.DB, st *storage.Storage, hub *watcher.Hub) *Handler {
	return &Handler{
		DB: db, Storage: st, Hub: hub,
		ShareTTLHours: 24 * 30,
		wsUpgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// 跨域 WS 由前置网关/CORS 控制；这里允许任意来源升级。
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// ---------- 节点（文件夹/文档）管理 ----------

type createNodeReq struct {
	ParentID *string `json:"parentId"`
	Scope    string  `json:"scope"` // personal | public
	Type     string  `json:"type"`  // folder | doc
	Title    string  `json:"title"`
	HTML     string  `json:"html"` // 仅 type=doc 时使用，纯 HTML 源码
}

func (h *Handler) CreateNode(c *gin.Context) {
	ownerID := getLocal(c, "userID")
	if ownerID == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var req createNodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err.Error())
		return
	}
	if req.Type != "folder" && req.Type != "doc" {
		badRequest(c, "type must be folder or doc")
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		req.Title = "未命名"
	}
	scope := strings.TrimSpace(req.Scope)
	if scope == "" {
		scope = "personal"
	}
	if scope != "personal" && scope != "public" {
		badRequest(c, "scope must be personal or public")
		return
	}
	if req.ParentID != nil && *req.ParentID != "" {
		var parent model.Node
		if err := h.DB.First(&parent, "id = ? AND type = 'folder'", *req.ParentID).Error; err != nil || !h.canWriteNode(ownerID, &parent) {
			badRequest(c, "invalid parent")
			return
		}
		scope = h.nodeScope(&parent)
	}
	n := model.Node{
		ID:         uuid.NewString(),
		OwnerID:    ownerID,
		CreatedBy:  ownerID,
		UpdatedBy:  ownerID,
		ParentID:   req.ParentID,
		Scope:      scope,
		Type:       req.Type,
		Title:      req.Title,
		EntryFile:  "index.html",
		Visibility: "private",
	}
	if req.Type == "doc" {
		if err := h.Storage.CreateDoc(n.ID, req.HTML); err != nil {
			serverError(c, err)
			return
		}
		h.Hub.AddDocWatch(h.Storage.DocPath(n.ID))
		n.SizeBytes = h.Storage.DocSize(n.ID)
	}
	if err := h.DB.Create(&n).Error; err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, n)
}

func (h *Handler) ListNodes(c *gin.Context) {
	ownerID := getLocal(c, "userID")
	var nodes []model.Node
	if err := h.DB.
		Where("scope = ? OR (scope = ? AND owner_id = ?)", "public", "personal", ownerID).
		Order("type desc, sort_order asc, created_at asc").
		Find(&nodes).Error; err != nil {
		log.Printf("[doc-hub api] ListNodes failed path=%s userID=%q username=%q error=%v", c.Request.URL.RequestURI(), getLocal(c, "userID"), getLocal(c, "username"), err)
		serverError(c, err)
		return
	}
	ids := make([]string, 0, len(nodes))
	for _, n := range nodes {
		if n.Type == "doc" {
			ids = append(ids, n.ID)
		}
	}
	log.Printf("[doc-hub api] ListNodes ok path=%s userID=%q username=%q total=%d docIDs=%v", c.Request.URL.RequestURI(), getLocal(c, "userID"), getLocal(c, "username"), len(nodes), ids)
	c.JSON(http.StatusOK, gin.H{"items": nodes})
}

func (h *Handler) GetNode(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ?", id).Error; err != nil || !h.canReadNode(ownerID, &n) {
		log.Printf("[doc-hub api] GetNode not found path=%s id=%q userID=%q username=%q error=%v", c.Request.URL.RequestURI(), id, getLocal(c, "userID"), getLocal(c, "username"), err)
		notFound(c)
		return
	}
	if n.Type == "doc" {
		files, _ := h.Storage.ListFiles(n.ID)
		log.Printf("[doc-hub api] GetNode ok path=%s id=%q title=%q type=%q visibility=%q userID=%q username=%q files=%v", c.Request.URL.RequestURI(), n.ID, n.Title, n.Type, n.Visibility, getLocal(c, "userID"), getLocal(c, "username"), files)
		c.JSON(http.StatusOK, gin.H{"node": n, "files": files})
		return
	}
	log.Printf("[doc-hub api] GetNode ok path=%s id=%q title=%q type=%q visibility=%q userID=%q username=%q", c.Request.URL.RequestURI(), n.ID, n.Title, n.Type, n.Visibility, getLocal(c, "userID"), getLocal(c, "username"))
	c.JSON(http.StatusOK, gin.H{"node": n})
}

type updateNodeReq struct {
	Title      *string `json:"title"`
	ParentID   *string `json:"parentId"`
	Scope      *string `json:"scope"`
	Visibility *string `json:"visibility"`
	EntryFile  *string `json:"entryFile"`
}

func (h *Handler) UpdateNode(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ?", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	var req updateNodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err.Error())
		return
	}
	if req.Title != nil {
		n.Title = *req.Title
		n.UpdatedBy = ownerID
	}
	if req.ParentID != nil {
		// 允许 ParentID 为 "" 表示移到根目录
		if *req.ParentID == "" {
			n.ParentID = nil
		} else {
			var parent model.Node
			if err := h.DB.First(&parent, "id = ? AND type = 'folder'", *req.ParentID).Error; err != nil || !h.canWriteNode(ownerID, &parent) {
				badRequest(c, "invalid parent")
				return
			}
			if parent.ID == n.ID || h.isDescendantAny(n.ID, parent.ID) {
				badRequest(c, "cannot move into self or descendant")
				return
			}
			n.Scope = h.nodeScope(&parent)
			n.UpdatedBy = ownerID
			pid := *req.ParentID
			n.ParentID = &pid
		}
	}
	if req.Scope != nil {
		scope := strings.TrimSpace(*req.Scope)
		if scope != "personal" && scope != "public" {
			badRequest(c, "scope must be personal or public")
			return
		}
		if n.ParentID != nil {
			badRequest(c, "scope can only be changed for root nodes")
			return
		}
		n.Scope = scope
		n.UpdatedBy = ownerID
	}
	if req.Visibility != nil {
		v := strings.TrimSpace(*req.Visibility)
		if v != "private" && v != "public" {
			badRequest(c, "visibility must be private or public")
			return
		}
		n.Visibility = v
		n.UpdatedBy = ownerID
	}
	if req.EntryFile != nil {
		n.EntryFile = *req.EntryFile
		n.UpdatedBy = ownerID
	}
	if err := h.DB.Save(&n).Error; err != nil {
		serverError(c, err)
		return
	}
	if n.Type == "folder" {
		if err := h.updateDescendantScope(n.ID, h.nodeScope(&n)); err != nil {
			serverError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, n)
}

func (h *Handler) DeleteNode(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ?", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	// 文件夹：递归删除子节点
	if n.Type == "folder" {
		if err := h.deleteRecursive(ownerID, id); err != nil {
			serverError(c, err)
			return
		}
	} else {
		_ = h.Storage.RemoveDoc(id)
		h.DB.Where("doc_id = ?", id).Delete(&model.Share{})
	}
	if err := h.DB.Delete(&n).Error; err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) deleteRecursive(ownerID, parentID string) error {
	var children []model.Node
	if err := h.DB.Where("parent_id = ?", parentID).Find(&children).Error; err != nil {
		return err
	}
	for _, ch := range children {
		if ch.Type == "folder" {
			if err := h.deleteRecursive(ownerID, ch.ID); err != nil {
				return err
			}
		} else {
			_ = h.Storage.RemoveDoc(ch.ID)
			h.DB.Where("doc_id = ?", ch.ID).Delete(&model.Share{})
		}
		if err := h.DB.Delete(&ch).Error; err != nil {
			return err
		}
	}
	return nil
}

// ---------- 文档内容上传 / 单文件读写 ----------

// UploadHTML 直接保存 HTML 源码到 index.html
type uploadHTMLReq struct {
	HTML string `json:"html"`
	File string `json:"file"` // 默认 index.html
}

func (h *Handler) UploadHTML(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	if err := h.assertNodeLock(ownerID, &n); err != nil {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error(), "lock": h.lockView(&n)})
		return
	}
	var req uploadHTMLReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err.Error())
		return
	}
	file := req.File
	if file == "" {
		file = "index.html"
	}
	if err := h.Storage.WriteFile(id, file, []byte(req.HTML)); err != nil {
		serverError(c, err)
		return
	}
	n.SizeBytes = h.Storage.DocSize(id)
	n.UpdatedBy = ownerID
	h.DB.Save(&n)
	c.JSON(http.StatusOK, gin.H{"ok": true, "size": n.SizeBytes})
}

// UploadZip 上传 zip 解压到文档目录
func (h *Handler) UploadZip(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	if err := h.assertNodeLock(ownerID, &n); err != nil {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error(), "lock": h.lockView(&n)})
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		badRequest(c, "missing file")
		return
	}
	f, err := fh.Open()
	if err != nil {
		serverError(c, err)
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		serverError(c, err)
		return
	}
	hasIndex, err := h.Storage.ExtractZip(id, bytesReaderAt(data), int64(len(data)))
	if err != nil {
		badRequest(c, err.Error())
		return
	}
	n.SizeBytes = h.Storage.DocSize(id)
	n.UpdatedBy = ownerID
	// 如果用户已经设置过 entryFile 且文件存在，则直接沿用；否则若顶层无 index.html，告诉前端需要选择入口
	files, _ := h.Storage.ListFiles(id)
	needsEntry := false
	if !hasIndex {
		// 当前 entryFile 是否仍然有效
		if !h.Storage.FileExists(id, n.EntryFile) {
			needsEntry = true
		}
	} else {
		// 顶层有 index.html：自动设为 entry
		n.EntryFile = "index.html"
	}
	h.DB.Save(&n)
	c.JSON(http.StatusOK, gin.H{
		"ok":         true,
		"size":       n.SizeBytes,
		"hasIndex":   hasIndex,
		"needsEntry": needsEntry,
		"files":      files,
	})
}

// GetFileContent 读取文档下指定文件文本内容（用于编辑器）
func (h *Handler) GetFileContent(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canReadNode(ownerID, &n) {
		notFound(c)
		return
	}
	sub := c.DefaultQuery("path", "index.html")
	full, err := h.Storage.ResolveSafe(id, sub)
	if err != nil {
		badRequest(c, "invalid path")
		return
	}
	data, err := readFileSafe(full)
	if err != nil {
		notFound(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"path": sub, "content": string(data)})
}

func (h *Handler) DeleteFile(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	if err := h.assertNodeLock(ownerID, &n); err != nil {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": err.Error(), "lock": h.lockView(&n)})
		return
	}
	sub := c.Query("path")
	if sub == "" {
		badRequest(c, "path required")
		return
	}
	if n.EntryFile == sub {
		badRequest(c, "cannot delete entry file")
		return
	}
	if err := h.Storage.RemoveFile(id, sub); err != nil {
		badRequest(c, err.Error())
		return
	}
	n.SizeBytes = h.Storage.DocSize(id)
	n.UpdatedBy = ownerID
	h.DB.Save(&n)
	c.JSON(http.StatusOK, gin.H{"ok": true, "size": n.SizeBytes})
}

// ---------- 静态资源服务 (/d/:id/*path) ----------

func (h *Handler) ServeDocAsset(c *gin.Context) {
	h.parseBearer(c)
	id := c.Param("id")
	sub := strings.TrimPrefix(c.Param("path"), "/")
	// 兼容历史行为：访问 /d/:id 或 /d/:id/ 时重定向到 index.html
	if sub == "" {
		c.Redirect(http.StatusFound, "/d/"+id+"/index.html")
		return
	}
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil {
		c.String(http.StatusNotFound, "Not Found")
		return
	}
	if !h.canAccessDocAsset(c, &n) {
		c.String(http.StatusForbidden, "Forbidden")
		return
	}
	full, err := h.Storage.ResolveSafe(id, sub)
	if err != nil {
		c.String(http.StatusBadRequest, "invalid path")
		return
	}
	// 设置 MIME 类型
	ext := strings.ToLower(filepath.Ext(full))
	if ct := mime.TypeByExtension(ext); ct != "" {
		c.Header("Content-Type", ct)
	}
	// 安全头：不允许被同源以外的 iframe 嵌入主站
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Referrer-Policy", "no-referrer")
	// 禁用浏览器/中间层缓存：文档内容会被实时编辑，必须每次拿最新版本
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	// 直接读文件并写入响应，确保拿到最新内容（避免任何中间缓存层）
	data, err := os.ReadFile(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			c.String(http.StatusNotFound, "Not Found")
			return
		}
		log.Printf("[ServeDocAsset] read file failed id=%s sub=%s err=%v", id, sub, err)
		c.String(http.StatusInternalServerError, "read failed")
		return
	}
	c.Status(http.StatusOK)
	_, _ = c.Writer.Write(data)
}

// ---------- 分享 ----------

func (h *Handler) CreateShare(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND owner_id = ? AND type = 'doc'", id, ownerID).Error; err != nil {
		notFound(c)
		return
	}
	// 复用已有未过期分享
	var existing model.Share
	if err := h.DB.Where("doc_id = ?", id).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, existing)
		return
	}
	tk := randomToken(12)
	var expiresAt *time.Time
	if h.ShareTTLHours > 0 {
		t := time.Now().Add(time.Duration(h.ShareTTLHours) * time.Hour)
		expiresAt = &t
	}
	s := model.Share{
		ID:        uuid.NewString(),
		DocID:     id,
		Token:     tk,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	if err := h.DB.Create(&s).Error; err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *Handler) DeleteShare(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND owner_id = ? AND type = 'doc'", id, ownerID).Error; err != nil {
		notFound(c)
		return
	}
	if err := h.DB.Where("doc_id = ?", id).Delete(&model.Share{}).Error; err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetShareInfo 通过 token 取得文档信息（前端 /s/:token 用）
func (h *Handler) GetShareInfo(c *gin.Context) {
	token := c.Param("token")
	var s model.Share
	if err := h.DB.Where("token = ?", token).First(&s).Error; err != nil {
		log.Printf("[doc-hub api] GetShareInfo share not found path=%s token=%q userID=%q username=%q error=%v", c.Request.URL.RequestURI(), token, getLocal(c, "userID"), getLocal(c, "username"), err)
		notFound(c)
		return
	}
	var n model.Node
	if err := h.DB.First(&n, "id = ?", s.DocID).Error; err != nil {
		log.Printf("[doc-hub api] GetShareInfo doc not found path=%s token=%q docID=%q userID=%q username=%q error=%v", c.Request.URL.RequestURI(), token, s.DocID, getLocal(c, "userID"), getLocal(c, "username"), err)
		notFound(c)
		return
	}
	log.Printf("[doc-hub api] GetShareInfo ok path=%s token=%q shareID=%q docID=%q title=%q visibility=%q userID=%q username=%q", c.Request.URL.RequestURI(), token, s.ID, n.ID, n.Title, n.Visibility, getLocal(c, "userID"), getLocal(c, "username"))
	c.JSON(http.StatusOK, gin.H{
		"share": s,
		"doc":   n,
	})
}

func (h *Handler) GetPublicDocInfo(c *gin.Context) {
	id := c.Param("id")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc' AND visibility = ?", id, "public").Error; err != nil {
		notFound(c)
		return
	}
	files, _ := h.Storage.ListFiles(n.ID)
	c.JSON(http.StatusOK, gin.H{"node": n, "files": files})
}

func (h *Handler) GetNodeInfo(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ?", id).Error; err != nil || !h.canReadNode(ownerID, &n) {
		notFound(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"node": h.nodeInfoView(&n)})
}

func (h *Handler) AcquireNodeLock(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	now := time.Now()
	if n.LockOwner != "" && n.LockOwner != ownerID && n.LockUntil != nil && n.LockUntil.After(now) {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{"error": "locked", "lock": h.lockView(&n)})
		return
	}
	until := now.Add(docLockTTL)
	n.LockOwner = ownerID
	n.LockUntil = &until
	if err := h.DB.Save(&n).Error; err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"lock": h.lockView(&n)})
}

func (h *Handler) GetNodeLock(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canReadNode(ownerID, &n) {
		notFound(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"lock": h.lockView(&n)})
}

func (h *Handler) ReleaseNodeLock(c *gin.Context) {
	id := c.Param("id")
	ownerID := getLocal(c, "userID")
	var n model.Node
	if err := h.DB.First(&n, "id = ? AND type = 'doc'", id).Error; err != nil || !h.canWriteNode(ownerID, &n) {
		notFound(c)
		return
	}
	if n.LockOwner == ownerID {
		n.LockOwner = ""
		n.LockUntil = nil
		if err := h.DB.Save(&n).Error; err != nil {
			serverError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---------- WebSocket 监听文档变更 ----------

func (h *Handler) WSDocWatch(c *gin.Context) {
	docID := c.Param("id")
	ownerID := h.parseBearer(c)
	var n model.Node
	if ownerID == "" || h.DB.First(&n, "id = ? AND type = 'doc'", docID).Error != nil || !h.canReadNode(ownerID, &n) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	conn, err := h.wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// Upgrade 失败时它内部已写过响应；这里只记录日志
		log.Printf("[doc-hub ws] upgrade failed docID=%s err=%v", docID, err)
		return
	}
	defer conn.Close()

	ch := h.Hub.Subscribe(docID)
	defer h.Hub.Unsubscribe(docID, ch)

	// 单独 goroutine 读，避免 Conn 阻塞被关闭
	done := make(chan struct{})
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				close(done)
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		case ev := <-ch:
			if ev == "" {
				return
			}
			if err := conn.WriteJSON(gin.H{"type": ev}); err != nil {
				return
			}
		}
	}
}

// ---------- 工具函数 ----------

func badRequest(c *gin.Context, msg string) {
	c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": msg})
}
func notFound(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "not found"})
}
func serverError(c *gin.Context, err error) {
	c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

// getLocal 等价于 fiber 的 c.Locals("xxx")，统一返回 string（便于日志格式化）。
func getLocal(c *gin.Context, key string) string {
	if v, ok := c.Get(key); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// 简单的 ReaderAt 包装
type byteReaderAt struct{ b []byte }

func (r *byteReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(r.b)) {
		return 0, errors.New("EOF")
	}
	n := copy(p, r.b[off:])
	if n < len(p) {
		return n, errors.New("short read")
	}
	return n, nil
}

func bytesReaderAt(b []byte) *byteReaderAt { return &byteReaderAt{b: b} }

func (h *Handler) canAccessDocAsset(c *gin.Context, n *model.Node) bool {
	uid := getLocal(c, "userID")
	if h.canReadNode(uid, n) {
		return true
	}
	if n.Visibility == "public" {
		return true
	}
	token := c.Query("share")
	if token == "" {
		token = c.GetHeader("X-HTMLHub-Share")
	}
	if token == "" {
		return false
	}
	var s model.Share
	if err := h.DB.Where("doc_id = ? AND token = ?", n.ID, token).First(&s).Error; err != nil {
		return false
	}
	return s.ExpiresAt == nil || s.ExpiresAt.After(time.Now())
}

func (h *Handler) nodeInfoView(n *model.Node) gin.H {
	return gin.H{
		"id":          n.ID,
		"title":       n.Title,
		"type":        n.Type,
		"scope":       h.nodeScope(n),
		"visibility":  n.Visibility,
		"sizeBytes":   n.SizeBytes,
		"createdAt":   n.CreatedAt,
		"updatedAt":   n.UpdatedAt,
		"createdBy":   h.userBrief(n.CreatedBy),
		"updatedBy":   h.userBrief(n.UpdatedBy),
		"owner":       h.userBrief(n.OwnerID),
		"currentLock": h.lockView(n),
		"entryFile":   n.EntryFile,
		"parentId":    n.ParentID,
	}
}

func (h *Handler) lockView(n *model.Node) gin.H {
	if n.LockOwner == "" || n.LockUntil == nil || !n.LockUntil.After(time.Now()) {
		return gin.H{"locked": false}
	}
	u := h.userBrief(n.LockOwner)
	return gin.H{
		"locked": true,
		"owner":  u,
		"until":  n.LockUntil,
	}
}

func (h *Handler) userBrief(id string) gin.H {
	if id == "" {
		return gin.H{"id": "", "name": "未知用户"}
	}
	var u model.User
	if err := h.DB.First(&u, "id = ?", id).Error; err != nil {
		return gin.H{"id": id, "name": "未知用户"}
	}
	name := u.DisplayName
	if strings.TrimSpace(name) == "" {
		name = u.Username
	}
	return gin.H{"id": u.ID, "name": name, "username": u.Username}
}

func (h *Handler) assertNodeLock(userID string, n *model.Node) error {
	if n.LockOwner == "" || n.LockOwner == userID || n.LockUntil == nil || !n.LockUntil.After(time.Now()) {
		return nil
	}
	return errors.New("document is locked by another user")
}

func (h *Handler) nodeScope(n *model.Node) string {
	if n.Scope == "public" {
		return "public"
	}
	return "personal"
}

func (h *Handler) canReadNode(userID string, n *model.Node) bool {
	if userID == "" {
		return false
	}
	if h.nodeScope(n) == "public" {
		return true
	}
	return n.OwnerID == userID
}

func (h *Handler) canWriteNode(userID string, n *model.Node) bool {
	if userID == "" {
		return false
	}
	if h.nodeScope(n) == "public" {
		return true
	}
	return n.OwnerID == userID
}

func (h *Handler) isDescendantAny(ancestor, candidate string) bool {
	current := candidate
	for i := 0; i < 100 && current != ""; i++ {
		var n model.Node
		if err := h.DB.Select("parent_id").First(&n, "id = ?", current).Error; err != nil {
			return false
		}
		if n.ParentID == nil {
			return false
		}
		if *n.ParentID == ancestor {
			return true
		}
		current = *n.ParentID
	}
	return false
}

func (h *Handler) updateDescendantScope(parentID, scope string) error {
	return h.updateDescendantScopeTx(h.DB, parentID, scope)
}

func (h *Handler) updateDescendantScopeTx(tx *gorm.DB, parentID, scope string) error {
	var children []model.Node
	if err := tx.Where("parent_id = ?", parentID).Find(&children).Error; err != nil {
		return err
	}
	for _, ch := range children {
		if err := tx.Model(&model.Node{}).Where("id = ?", ch.ID).Update("scope", scope).Error; err != nil {
			return err
		}
		if ch.Type == "folder" {
			if err := h.updateDescendantScopeTx(tx, ch.ID, scope); err != nil {
				return err
			}
		}
	}
	return nil
}
