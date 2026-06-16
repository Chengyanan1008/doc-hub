
#### 特别备注：此系统是基于 [https://github.com/IcedSoul/web-doc](https://github.com/IcedSoul/web-doc) 大佬的项目做的二次开发，但是做了一些产品迭代：
1. 从单人 HTML 文档站升级为内部多用户文档管理平台。
2. 增加个人空间与公共空间，支持团队资料和个人资料分层管理。
3. 增加 owner 权限模型，隔离文档、AI 配置、Prompt 和 MCP token。
4. 增加管理员用户管理和用户自助改密。
5. 增强分享安全：过期、撤销、资源层校验。
6. 增加公开文档免登录访问。
7. 增加 Markdown 上传、渲染、代码高亮和相对资源处理。
8. 增加文档编辑锁，降低多人覆盖写入风险。
9. 增加文档信息面板，展示创建人、修改人、入口文件、访问范围、编辑状态。
10. 优化文档树交互：公共/个人分区、根目录投放区、文件夹拖拽收纳。
11. 优化分享页链路，直接 iframe 展示分享内容。
12. 调整 Docker Compose 和环境变量，降低内部部署门槛，并默认本地绑定。
---

# Doc-Hub — 内部文档管理与分享平台

**Language / 语言**: [English](./README.md) · **中文**

Doc-Hub 是一个面向内部使用的文档、页面和多文件项目管理平台。它支持上传、编辑、预览、AI 生成、权限分享、公共目录、个人目录和多人编辑锁，适合把零散的文档、表格、演示稿、HTML 报告、Markdown 文档、工具页和多文件静态项目集中管理起来。后续也可以继续扩展 Excel、CSV、docx、PPT 等更多文件类型。

---

## 主要功能

### 文档与目录

- **公共目录**：登录用户都能看到公共目录下的文件和文件夹。
- **个人目录**：仅文件所有者可见。
- **文件夹管理**：支持新建、重命名、删除、拖拽移动。
- **任意拖拽**：文件可以拖到根目录，也可以拖到任意文件夹内。
- **单文件 HTML**：支持直接粘贴 HTML 或上传 `.html`。
- **单文件 Markdown**：支持粘贴 Markdown 或上传 `.md`，预览区自动渲染成页面。
- **多文件项目**：支持上传包含 HTML、Markdown 和静态资源的 `.zip`；顶层 `index.html` 会自动作为入口，没有 `index.html` 时可手动选择 `.html` 或 `.md` 入口，例如 `index.md`、`README.md`。
- **文件信息**：可查看上传/修改用户、精确到秒的时间、目录类型、访问状态、大小、入口文件和编辑锁状态。

<img width="1920" height="928" alt="image" src="https://github.com/user-attachments/assets/eb961425-f273-479d-89bb-9a63c8394c8a" />

### 编辑与预览

- **Monaco 编辑器**：支持 `预览`、`分屏`、`代码` 三种模式。
- **实时预览**：文档目录中文件变化后，通过 WebSocket 自动刷新预览。
- **沙箱 iframe**：HTML 内容运行在沙箱 iframe 中，降低脚本影响主系统的风险。
- **Markdown 自动渲染**：入口文件为 `.md` 时，预览、分屏和分享页面都会自动渲染 Markdown。
- **编辑锁**：用户进入编辑模式后自动加锁；其他用户看到“xxx 正在编辑”，并只能只读查看，保存/上传/AI 改写会被后端拒绝。
- **返回首页**：打开文档后仍可回到首页。
- **侧栏记忆**：登录后侧栏默认展开；用户手动关闭后会记住，重新登录或清理浏览器数据后恢复默认。

### 权限与分享

分享权限分三档，逻辑接近飞书文档：

- **未开启**：撤销匿名访问，只有有权限的登录用户能看。
- **获得链接的人**：生成 `/s/{shareToken}` 分享链接，拿到链接的人可以访问；可以随时撤销。
- **互联网公开**：生成 `/v/{docId}` 公开访问地址，未登录用户也能看；切回“未开启”即可撤销。

注意：**公共目录不是互联网公开**。公共目录只对已登录用户可见；互联网公开才允许未登录访问。

### 登录与多用户

- 用户名/密码注册和登录。
- JWT 鉴权。
- 登录用户可在头像菜单中自行修改密码。
- 可通过 `DOC_HUB_DISABLE_REGISTER=1` 关闭公开注册。
- 管理员可在用户菜单中打开“用户管理”，直接创建普通用户或管理员。
- 文档、AI 设置、Prompt、MCP Token 按用户隔离。
- 公共目录内容对所有登录用户可见；个人目录内容只对自己可见。

### AI 与 MCP

- 支持 OpenAI Chat Completions 兼容接口。
- 支持 OpenAI、DeepSeek、Kimi、智谱、通义、OpenRouter 和自定义兼容网关。
- 支持 AI 生成新文档、改写当前文档、AI 对话面板、Prompt 模板管理。
- 内置 MCP Server，Agent 可通过 `POST /mcp` 管理文档。

---

## 项目结构

```text
doc-hub/
├── apps/
│   ├── api/                    # Go 后端：REST、认证、文件、分享、锁、MCP、AI
│   └── web/                    # React + Vite 前端
├── dist/                       # 本地构建产物
├── Dockerfile                  # 单镜像构建
├── docker-compose.yml          # Postgres + Doc-Hub
├── .env.example                # 环境变量示例
├── README.md
└── README.zh-CN.md
```

Go module 名称为：

```text
doc-hub/api
```

---

## 推荐启动方式：Docker Compose

项目当前推荐用 Docker Compose 启动，不需要手动运行 Go。

### 1. 从 GitHub 克隆后快速启动

```bash
git clone <你的仓库地址>
cd doc-hub
docker compose up -d --build
```

这条快速路径会使用 `docker-compose.yml` 里的本机默认配置，并允许首次注册管理员账号。

### 2. 准备 `.env`（正式多人使用建议）

第一次部署可以复制示例文件：

```bash
cp .env.example .env
```

如果只是本机快速试用，也可以不复制 `.env.example`，因为 `docker-compose.yml` 已经带了本机默认配置。正式多人使用前，建议复制 `.env.example` 为 `.env`，修改 `DOC_HUB_JWT_SECRET`，并且不要把 `.env` 提交到 Git。

本机访问的默认配置：

```env
DOC_HUB_BIND_ADDR=127.0.0.1
DOC_HUB_PORT=8787
DOC_HUB_ORIGIN=http://localhost:8787,http://127.0.0.1:8787
DOC_HUB_JWT_SECRET=change-this-internal-secret-before-sharing
DOC_HUB_DISABLE_REGISTER=0
DOC_HUB_SHARE_TTL_HOURS=720
```

首次创建管理员账号时，保持：

```env
DOC_HUB_DISABLE_REGISTER=0
```

注册完管理员后，建议改成：

```env
DOC_HUB_DISABLE_REGISTER=1
```

然后重启：

```bash
docker compose up -d
```

如果仍希望让用户自行注册，可以临时保持或改回：

```env
DOC_HUB_DISABLE_REGISTER=0
```

让用户注册完成后，再改成：

```env
DOC_HUB_DISABLE_REGISTER=1
```

并重启服务。这样可以减少公网环境下被陌生人自助注册的风险。

注册完管理员后，可以在头像菜单中打开 **用户管理**，由管理员创建普通用户或其他管理员。

登录后的个人用户可以在右上角头像菜单中点击 **修改密码**，输入当前密码和新密码完成修改。

### 3. 启动

```bash
docker compose up -d --build
```

### 4. 访问

```text
http://127.0.0.1:8787
```

或：

```text
http://localhost:8787
```

### 5. 查看状态和日志

```bash
docker compose ps
docker compose logs -f server
```

### 6. 停止服务

```bash
docker compose down
```

---

## 在 PyCharm 里启动

1. 用 PyCharm 打开目录：

```text
doc-hub
```

2. 确认 Docker Desktop 已启动。

3. 打开 PyCharm Terminal，执行：

```bash
docker compose up -d --build
```

4. 浏览器访问：

```text
http://127.0.0.1:8787
```

日常开发如果只是启动和停止，用 PyCharm 的 Terminal 即可，不需要懂 Go。

---

## 局域网访问、公网部署和域名配置

默认 `.env` 只监听本机：

```env
DOC_HUB_BIND_ADDR=127.0.0.1
```

如果要让同一局域网内的电脑或手机访问，并且不想每次内网 IP 变化都改配置，可以改成监听所有网卡：

```env
DOC_HUB_BIND_ADDR=0.0.0.0
DOC_HUB_ORIGIN=*
```

然后重启：

```bash
docker compose up -d
```

同一局域网用户可以访问：

```text
http://你的内网IP:8787
```

macOS 也可以尝试使用本地主机名：

```text
http://你的主机名.local:8787
```

如果要部署到公网服务器并配置域名，需要改成：

```env
DOC_HUB_BIND_ADDR=0.0.0.0
DOC_HUB_ORIGIN=https://your-domain.example.com
DOC_HUB_JWT_SECRET=一个足够长的随机密钥
```

然后重启：

```bash
docker compose up -d --build
```

如果通过 Nginx、Caddy 或云负载均衡反向代理到本服务，后端容器仍监听 `8787`，外部域名由反向代理负责转发。

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `DOC_HUB_BIND_ADDR` | `127.0.0.1` | Docker 端口绑定地址；局域网或公网部署用 `0.0.0.0`。 |
| `DOC_HUB_PORT` | `8787` | 宿主机访问端口。 |
| `DOC_HUB_ADDR` | `:8787` | 容器内 Go 服务监听地址。 |
| `DOC_HUB_STORAGE` | `/data/docs` | 文档文件存储目录。 |
| `DOC_HUB_WEB_ROOT` | `/app/web` | 前端构建产物目录。 |
| `DOC_HUB_ORIGIN` | 本机地址 | CORS 白名单；可信局域网可用 `*`，公网部署建议设置为固定域名。 |
| `DOC_HUB_JWT_SECRET` | 不安全默认值 | JWT 签名密钥，生产环境必须改。 |
| `DOC_HUB_DISABLE_REGISTER` | `1` | `1` 关闭注册，`0` 允许注册。 |
| `DOC_HUB_SHARE_TTL_HOURS` | `720` | 分享链接有效期，单位小时。 |
| `DOC_HUB_DSN` | 空 | 完整 Postgres DSN；设置后覆盖拆分配置。 |
| `DOC_HUB_PG_HOST` | `postgres` | Postgres 主机。 |
| `DOC_HUB_PG_PORT` | `5432` | Postgres 端口。 |
| `DOC_HUB_PG_USER` | `doc-hub` | Postgres 用户。 |
| `DOC_HUB_PG_PASSWORD` | `doc-hub` | Postgres 密码。 |
| `DOC_HUB_PG_DB` | `doc-hub` | Postgres 数据库名。 |
| `DOC_HUB_PG_SSLMODE` | `disable` | Postgres SSL 模式。 |

---

## 常用命令

```bash
# 启动或更新
docker compose up -d --build

# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f server

# 停止
docker compose down

# 前端构建检查
cd apps/web && npm run build

# 后端测试
cd apps/api && go test ./...

# 后端本地构建
npm run build:api
```

---

## AI 配置

登录 Doc-Hub 后，点击左侧栏顶部的 **AI 设置** 按钮。

在 **连接 / 模型** 页签中配置：

| 字段 | 说明 |
|---|---|
| `Base URL` | OpenAI Chat Completions 兼容接口地址，例如 `https://api.openai.com/v1`。 |
| `API Key` | 服务商 API Key；保存在本地 Doc-Hub 数据库中。 |
| `Model` | 模型名称，例如 `gpt-4o-mini`，或其他兼容服务商提供的模型名。 |
| `Temperature` | 生成随机性。 |
| `Max Tokens` | 单次请求最大输出 token。 |
| `Tool Rounds` | 修改任务中最多允许的工具调用轮数。 |
| `启用 Tool Calling` | 开启后，AI 修改文档时可以调用 `list_files`、`read_file`、`write_file`、`replace_in_file` 等工具按需读写文件，避免把整个项目一次性塞给模型。模型和服务商需要支持 function calling。 |

界面内置 OpenAI、DeepSeek、Kimi、智谱、通义、OpenRouter 和自定义兼容网关等预设。AI 设置按登录用户隔离。

**Skill 管理** 页签用于维护 Prompt 模板，控制创建/改写时的提示词；它和 Tool Calling 是两个独立能力。

---

## MCP 接入

登录后打开 **AI 设置 -> MCP 接入**。

MCP 的作用是让外部 AI 客户端把 Doc-Hub 当成一个受控的文档工作区。接入 Claude Desktop、Cursor、Cline 等客户端后，客户端可以凭 Token 调用 Doc-Hub 能力，例如列出文档、创建文档、读取文件、上传或覆盖 HTML/Markdown/CSS/JS 文件、上传 ZIP 项目、删除文档或文件。

典型使用场景：

- 让外部 AI 客户端读取 Doc-Hub 里的某个文档，并改写其中一部分。
- 直接生成一个新的 Markdown 或 HTML 文档到 Doc-Hub。
- 让 Agent 检查一个多文件静态项目，定位需要修改的文件，并把修改写回 Doc-Hub。

网页内置 AI 主要在 Doc-Hub 页面内使用；MCP 用于外部 AI Agent。删除 MCP Token 后，对应外部客户端会立即失效。

1. 复制面板中显示的 MCP 服务端点。本机默认通常是：

```text
http://127.0.0.1:8787/mcp
```

2. 在 **访问 Token** 区域生成 Token。Token 明文只显示一次，请立即复制保存。
3. MCP 客户端需要携带请求头：

```text
Authorization: Bearer <YOUR_TOKEN>
```

MCP 端点使用 Streamable HTTP / JSON-RPC 2.0，支持文档列表、创建、读取、上传、删除等操作。

Claude Desktop、Cursor、Cline 可以使用界面生成的 `mcp-remote` 配置示例，形式如下：

```json
{
  "mcpServers": {
    "doc-hub": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:8787/mcp",
        "--header",
        "Authorization: Bearer <YOUR_TOKEN>"
      ]
    }
  }
}
```

如果 MCP 客户端运行在局域网其他设备上，需要把 `127.0.0.1` 换成你的内网 IP 或 macOS `.local` 主机名。

---

## HTTP API 概览

### 认证

- `GET /api/auth/public-info`：注册是否开放。
- `POST /api/auth/register`：注册。
- `POST /api/auth/login`：登录。
- `GET /api/auth/me`：当前用户。
- `PATCH /api/auth/password`：个人修改密码。
- `GET /api/admin/users`：管理员列出用户。
- `POST /api/admin/users`：管理员创建用户。

### 节点、目录和文档

- `GET /api/nodes`：获取当前用户可见的公共/个人节点。
- `POST /api/nodes`：创建文件夹或文档。
- `GET /api/nodes/:id`：获取节点详情。
- `PATCH /api/nodes/:id`：更新名称、目录、访问状态等。
- `DELETE /api/nodes/:id`：删除节点。
- `PATCH /api/nodes/reorder/batch`：拖拽排序和移动。
- `GET /api/nodes/:id/info`：文件信息。

### 编辑锁

- `GET /api/nodes/:id/lock`：查看锁状态。
- `POST /api/nodes/:id/lock`：获取/续期编辑锁。
- `DELETE /api/nodes/:id/lock`：释放编辑锁。

### 文件

- `POST /api/docs/:id/html`：上传单文件 HTML 或 Markdown 内容。
- `POST /api/docs/:id/zip`：上传多文件 ZIP 项目。
- `GET /api/docs/:id/file?path=...`：读取文件。
- `POST /api/docs/:id/file`：保存文件。

### 分享

- `POST /api/docs/:id/share`：生成“获得链接的人”分享链接。
- `DELETE /api/docs/:id/share`：撤销分享链接。
- `GET /api/shares/:token`：解析分享链接。
- `GET /api/public/docs/:id`：访问互联网公开文档信息。

### AI 与 MCP

- `GET /api/ai/settings` / `PATCH /api/ai/settings`：AI 设置。
- `POST /api/ai/generate`：AI 生成或改写。
- `GET/POST/PATCH/DELETE /api/ai/prompts`：Prompt 模板管理。
- `GET/POST/DELETE /api/mcp/tokens`：MCP Token 管理。
- `POST /mcp`：MCP JSON-RPC 端点。

---

## 安全注意事项

- 生产环境必须修改 `DOC_HUB_JWT_SECRET`。
- 不建议在公网长期保持 `DOC_HUB_DISABLE_REGISTER=0`。
- “公共目录”只代表登录用户可见，不等于互联网公开。
- “互联网公开”会允许未登录访问，发布前请确认内容可以外传。
- HTML 预览运行在 sandbox iframe 中，但上传内容仍应按内部安全规范管理。

---

## 当前数据卷

Docker Compose 使用以下数据卷：

```text
doc-hub_pgdata
doc-hub_docs
```

删除这些 volume 会清空数据库和已上传的文档文件。
