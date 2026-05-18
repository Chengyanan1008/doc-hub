package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Settings 运行时所需的最小配置
type Settings struct {
	BaseURL      string
	APIKey       string
	Model        string
	SystemPrompt string
	Temperature  float64
	MaxTokens    int
}

// ChatMessage OpenAI 兼容
// Role: system | user | assistant | tool
type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"` // role=tool 时填
	Name       string     `json:"name,omitempty"`         // role=tool 时填工具名
}

// ToolCall OpenAI 兼容
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"` // function
	Function FunctionCall `json:"function"`
}

type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

// Tool 定义
type Tool struct {
	Type     string         `json:"type"` // function
	Function ToolDefinition `json:"function"`
}

type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// StreamCallbacks 流式回调
type StreamCallbacks struct {
	OnContentDelta   func(text string)            // 普通文本增量
	OnToolCallStart  func(index int, id, name string) // 一个新的 tool call 开始
	OnToolCallArgs   func(index int, deltaArgs string) // tool call 参数增量
	OnFinish         func(reason string)          // 本轮结束
}

// StreamResult 一轮调用的最终聚合结果
type StreamResult struct {
	Content      string     // 模型输出的文本（可能为空）
	ToolCalls    []ToolCall // 解析完成的 tool calls（按 index 排序）
	FinishReason string     // stop | tool_calls | length | ...
}

// StreamChat 调用 OpenAI 兼容的 chat/completions（stream=true），支持 tools。
func StreamChat(
	ctx context.Context,
	st Settings,
	messages []ChatMessage,
	tools []Tool,
	cb StreamCallbacks,
) (*StreamResult, error) {
	if strings.TrimSpace(st.BaseURL) == "" {
		return nil, errors.New("ai base url not configured")
	}
	if strings.TrimSpace(st.Model) == "" {
		return nil, errors.New("ai model not configured")
	}

	url := strings.TrimRight(st.BaseURL, "/") + "/chat/completions"
	temp := st.Temperature
	if temp == 0 {
		temp = 0.7
	}
	maxTok := st.MaxTokens
	if maxTok == 0 {
		maxTok = 8192
	}

	payload := map[string]any{
		"model":       st.Model,
		"messages":    messages,
		"stream":      true,
		"temperature": temp,
		"max_tokens":  maxTok,
	}
	if len(tools) > 0 {
		payload["tools"] = tools
		payload["tool_choice"] = "auto"
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if st.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+st.APIKey)
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upstream %d: %s", resp.StatusCode, truncate(string(raw), 500))
	}

	var (
		contentBuf   strings.Builder
		toolCallsMap = map[int]*ToolCall{} // index -> partial tool call
		startedTC    = map[int]bool{}      // 是否已触发 OnToolCallStart
		finishReason string
	)

	reader := bufio.NewReader(resp.Body)
	for {
		select {
		case <-ctx.Done():
			return &StreamResult{Content: contentBuf.String()}, ctx.Err()
		default:
		}
		line, err := reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}

		// 解析 chunk
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason any `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		ch := chunk.Choices[0]

		if ch.Delta.Content != "" {
			contentBuf.WriteString(ch.Delta.Content)
			if cb.OnContentDelta != nil {
				cb.OnContentDelta(ch.Delta.Content)
			}
		}

		for _, tcd := range ch.Delta.ToolCalls {
			tc, ok := toolCallsMap[tcd.Index]
			if !ok {
				tc = &ToolCall{Type: "function"}
				toolCallsMap[tcd.Index] = tc
			}
			if tcd.ID != "" {
				tc.ID = tcd.ID
			}
			if tcd.Type != "" {
				tc.Type = tcd.Type
			}
			if tcd.Function.Name != "" {
				tc.Function.Name += tcd.Function.Name
			}
			if tcd.Function.Arguments != "" {
				tc.Function.Arguments += tcd.Function.Arguments
			}
			// 第一次出现且有名称：触发 start
			if !startedTC[tcd.Index] && tc.Function.Name != "" {
				startedTC[tcd.Index] = true
				if cb.OnToolCallStart != nil {
					cb.OnToolCallStart(tcd.Index, tc.ID, tc.Function.Name)
				}
			}
			if tcd.Function.Arguments != "" && cb.OnToolCallArgs != nil {
				cb.OnToolCallArgs(tcd.Index, tcd.Function.Arguments)
			}
		}

		if fr, ok := ch.FinishReason.(string); ok && fr != "" {
			finishReason = fr
		}
	}

	// 聚合 tool calls 按 index 排序
	indexes := make([]int, 0, len(toolCallsMap))
	for idx := range toolCallsMap {
		indexes = append(indexes, idx)
	}
	// 简单冒泡排序（数量极少）
	for i := 0; i < len(indexes); i++ {
		for j := i + 1; j < len(indexes); j++ {
			if indexes[j] < indexes[i] {
				indexes[i], indexes[j] = indexes[j], indexes[i]
			}
		}
	}
	calls := make([]ToolCall, 0, len(indexes))
	for _, idx := range indexes {
		tc := toolCallsMap[idx]
		// 兜底：没 ID 的话生成一个
		if tc.ID == "" {
			tc.ID = fmt.Sprintf("call_%d_%d", time.Now().UnixNano(), idx)
		}
		if tc.Type == "" {
			tc.Type = "function"
		}
		calls = append(calls, *tc)
	}

	if cb.OnFinish != nil {
		cb.OnFinish(finishReason)
	}
	return &StreamResult{
		Content:      contentBuf.String(),
		ToolCalls:    calls,
		FinishReason: finishReason,
	}, nil
}

// ExtractHTML 从 LLM 输出中提取 HTML：
//  1. 优先从 ```html ... ``` 代码块抓取
//  2. 否则查找首个 <!DOCTYPE 或 <html，截到末尾
//  3. 否则返回原文（让前端兜底为完整文档）
func ExtractHTML(raw string) string {
	for _, fence := range []string{"```html", "```HTML", "```"} {
		if i := strings.Index(raw, fence); i >= 0 {
			rest := raw[i+len(fence):]
			if nl := strings.IndexByte(rest, '\n'); nl >= 0 {
				rest = rest[nl+1:]
			}
			if j := strings.Index(rest, "```"); j >= 0 {
				return strings.TrimSpace(rest[:j])
			}
		}
	}
	lo := strings.ToLower(raw)
	for _, marker := range []string{"<!doctype", "<html"} {
		if i := strings.Index(lo, marker); i >= 0 {
			return strings.TrimSpace(raw[i:])
		}
	}
	return strings.TrimSpace(raw)
}

// EnsureFullHTML 确保输出是一个完整可渲染的 HTML 文档
func EnsureFullHTML(s string) string {
	low := strings.ToLower(s)
	if strings.Contains(low, "<!doctype") || strings.Contains(low, "<html") {
		return s
	}
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>AI 生成</title>
</head>
<body>
` + s + `
</body>
</html>`
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ===================== 系统 Prompt 默认值 =====================

// DefaultSystemPrompt 兼容旧字段：当未配置 create/edit 专用 prompt 时回落到此。
const DefaultSystemPrompt = "你是一名世界顶级的 Web 设计师和前端工程师，擅长创建视觉精美、交互流畅、响应式的 HTML 文档。\n\n" +
	"请根据用户的需求，生成一份**完整、独立、可直接运行**的 HTML 文档。\n\n" +
	"要求：\n" +
	"1. 必须是完整的 HTML 文档（包含 <!DOCTYPE html>、<head>、<body>）\n" +
	"2. 所有 CSS 写在 <style> 标签中，所有 JS 写在 <script> 标签中（除非用户要求多文件）\n" +
	"3. 使用现代 CSS（Flexbox/Grid、CSS 变量、暗色模式适配）\n" +
	"4. 设计风格：精致、留白合理、有视觉层次、配色和谐\n" +
	"5. 字体：默认使用系统字体栈\n" +
	"6. 中文排版友好（行高 1.6+，段落清晰）\n" +
	"7. 如果是数据展示/图表，可以使用 ECharts CDN（https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js）\n" +
	"8. 不要输出任何解释性文字，直接输出完整 HTML 源码（可以放在 ```html 代码块中）"

// DefaultCreatePrompt 创建场景默认 Prompt（直接产出 HTML）
const DefaultCreatePrompt = DefaultSystemPrompt

// DefaultEditPrompt 修改场景默认 Prompt（引导使用 tools）
const DefaultEditPrompt = `你是一名资深 Web 工程师，正在协助用户编辑一个 HTML 文档项目。

# 工作方式
你可以调用以下工具来读取和修改项目文件，**不要把文档原文写在回复里**：

- list_files：列出当前文档下所有文件
- read_file(path)：读取一个文件的内容
- write_file(path, content)：完整写入或新建一个文件
- replace_in_file(path, old_string, new_string)：在已有文件里做精准替换；old_string 必须是文件中**唯一存在**的一段连续字符串

# 流程
1. 先用 list_files 了解项目结构
2. 用 read_file 读取需要修改的文件（一般是 index.html）
3. 优先使用 replace_in_file 做小范围精准修改；只有当改动幅度大、整体重构时才使用 write_file
4. 修改完成后，用一两句话简明告诉用户你做了什么；不要复述代码

# 规则
- 每次 replace_in_file 时，old_string 至少包含 3 行上下文（前后各 1 行），确保唯一定位
- 不要在同一次回复里对同一段代码做重复或冲突的替换
- 始终保持 HTML 结构合法、CSS/JS 不报错
- 中文文档保留中文；不要无故修改用户已有文案
- 如果用户的要求模糊，可以先用工具读取文件再决定怎么改`

// BuildToolset 返回内置 4 个工具的 schema
func BuildToolset() []Tool {
	return []Tool{
		{
			Type: "function",
			Function: ToolDefinition{
				Name:        "list_files",
				Description: "列出当前文档下的所有文件相对路径。无参数。",
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
		{
			Type: "function",
			Function: ToolDefinition{
				Name:        "read_file",
				Description: "读取当前文档下指定文件的完整内容。",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"path": map[string]any{
							"type":        "string",
							"description": "相对路径，如 index.html、styles/main.css",
						},
					},
					"required": []string{"path"},
				},
			},
		},
		{
			Type: "function",
			Function: ToolDefinition{
				Name:        "write_file",
				Description: "完整写入一个文件（覆盖已有内容或新建）。仅在大幅重写或创建新文件时使用，小改动请优先使用 replace_in_file。",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"path": map[string]any{
							"type":        "string",
							"description": "相对路径，如 index.html",
						},
						"content": map[string]any{
							"type":        "string",
							"description": "完整文件内容",
						},
					},
					"required": []string{"path", "content"},
				},
			},
		},
		{
			Type: "function",
			Function: ToolDefinition{
				Name:        "replace_in_file",
				Description: "对已有文件做精准替换。old_string 必须是文件中唯一存在的一段连续字符串，建议至少包含 3 行上下文。如果出现多个匹配会报错。",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"path": map[string]any{
							"type":        "string",
							"description": "相对路径",
						},
						"old_string": map[string]any{
							"type":        "string",
							"description": "要被替换的原始字符串（必须在文件中唯一）",
						},
						"new_string": map[string]any{
							"type":        "string",
							"description": "替换后的新字符串",
						},
					},
					"required": []string{"path", "old_string", "new_string"},
				},
			},
		},
	}
}
