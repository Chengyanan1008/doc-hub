package watcher

import (
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Hub 管理 WebSocket 订阅，按 docID 推送文件变更
type Hub struct {
	mu      sync.RWMutex
	subs    map[string]map[chan string]struct{} // docID -> set of chans
	watcher *fsnotify.Watcher
	root    string
	debounce map[string]*time.Timer
	dmu      sync.Mutex
}

func NewHub(root string) (*Hub, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	h := &Hub{
		subs:     make(map[string]map[chan string]struct{}),
		watcher:  w,
		root:     root,
		debounce: make(map[string]*time.Timer),
	}
	// 监听根目录及其子目录
	_ = w.Add(root)
	go h.run()
	return h, nil
}

// AddDocWatch 添加对某个文档目录的监听
func (h *Hub) AddDocWatch(dir string) {
	_ = h.watcher.Add(dir)
}

// Subscribe 订阅某个 docID 的变更，返回一个通道
func (h *Hub) Subscribe(docID string) chan string {
	ch := make(chan string, 8)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[docID] == nil {
		h.subs[docID] = make(map[chan string]struct{})
	}
	h.subs[docID][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(docID string, ch chan string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.subs[docID]; ok {
		delete(m, ch)
		close(ch)
		if len(m) == 0 {
			delete(h.subs, docID)
		}
	}
}

func (h *Hub) broadcast(docID, event string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[docID] {
		select {
		case ch <- event:
		default:
		}
	}
}

func (h *Hub) run() {
	for {
		select {
		case ev, ok := <-h.watcher.Events:
			if !ok {
				return
			}
			h.handleEvent(ev)
		case err, ok := <-h.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[watcher] error: %v", err)
		}
	}
}

func (h *Hub) handleEvent(ev fsnotify.Event) {
	// 把绝对路径转换为相对 root 的路径，提取 docID（即第一段）
	rel, err := filepath.Rel(h.root, ev.Name)
	if err != nil || strings.HasPrefix(rel, "..") {
		return
	}
	parts := strings.SplitN(filepath.ToSlash(rel), "/", 2)
	if len(parts) == 0 || parts[0] == "" || parts[0] == "." {
		return
	}
	docID := parts[0]

	// 新增子目录则递归监听
	if ev.Op&fsnotify.Create != 0 {
		if info, err := filepathStat(ev.Name); err == nil && info.IsDir() {
			_ = h.watcher.Add(ev.Name)
		}
	}

	// 防抖 200ms 内合并
	h.dmu.Lock()
	defer h.dmu.Unlock()
	if t, ok := h.debounce[docID]; ok {
		t.Stop()
	}
	h.debounce[docID] = time.AfterFunc(200*time.Millisecond, func() {
		h.broadcast(docID, "reload")
	})
}
