# Doc-Hub 相对 IcedSoul/web-doc 的二开差异

## 对比基线

- 上游仓库：<https://github.com/IcedSoul/web-doc>
- 在线读取到的上游 `main` 树 SHA：`90adc0572a1370a5353f5d5895661b3fff5ab9b8`
- 本地项目：`/Users/happyelements/AI/doc-hub`
- 本地当前提交：`78a5f20 Prepare doc-hub project`

说明：上游 `main` 的 SHA 与本地初始提交 `90adc05 init` 一致，因此以下结论基于本地 `90adc05..HEAD` 的实际差异整理。未把上游代码拉取到本地。

## 总体结论

这个项目已经不只是简单改名，而是把原本偏“个人 HTML 文档站”的 `web-doc`，二开成了更适合内部团队使用的 `Doc-Hub`：增加了用户隔离、公共/个人目录、管理员用户管理、分享访问控制、公开文档直访、Markdown 预览、编辑锁、文档信息面板，以及更稳妥的 Docker 部署配置。

代码规模上，本次二开涉及 44 个文件，约 `6687` 行新增、`844` 行删除。其中 `apps/web/package-lock.json` 是新增锁文件，占较大行数；核心业务改动集中在 Go 后端 handler/model/config，以及 React 前端文档树、查看器、创建弹窗、分享页和用户菜单。

## 品牌与工程命名

- 项目名从 `web-doc` 改为 `doc-hub` / `Doc-Hub`。
- Go module 从 `github.com/xiaofengguo/web-doc/api` 改为 `doc-hub/api`。
- 前端包名从 `web-doc` 改为 `doc-hub-web`。
- 构建产物从 `webdoc-server` / `web-doc` 改为 `doc-hub-server` / `doc-hub`。
- 日志前缀、MCP server name、前端事件名等统一从 `web-doc` 调整为 `doc-hub`。

相关文件：

- `package.json`
- `apps/api/go.mod`
- `Dockerfile`
- `apps/web/package.json`
- `apps/api/cmd/server/main.go`
- `apps/api/internal/handler/mcp.go`

## 后端能力变化

### 1. 用户级数据隔离

原上游节点、AI 配置、Prompt 模板、MCP Token 更偏全局共享。本地二开后增加了 `owner_id` 及相关权限判断：

- `Node` 新增 `OwnerID`、`CreatedBy`、`UpdatedBy`。
- `AISettings` 从全局单行配置变成按用户一行配置。
- `MCPToken` 新增 `OwnerID`，用户只能管理自己的 MCP Token。
- `PromptTemplate` 新增 `OwnerID`，内置模板仍全局可见，自定义模板按用户隔离。
- 新增 `BackfillOwnership`，用于把历史无 owner 的数据回填给第一个管理员或第一个用户。

价值：多用户使用时，个人文档、个人 AI 配置、个人 MCP Token 不再互相串数据。

相关文件：

- `apps/api/internal/model/model.go`
- `apps/api/internal/model/seed.go`
- `apps/api/internal/handler/handler.go`
- `apps/api/internal/handler/ai_reorder.go`
- `apps/api/internal/handler/mcp.go`

### 2. 公共 / 个人目录模型

`Node` 新增 `Scope` 字段：

- `personal`：个人空间，仅 owner 可写，列表中只返回自己的个人内容。
- `public`：公共空间，登录用户可见并可写。

节点创建、更新、拖拽排序、AI 生成都会带上或继承 `scope`。移动文件夹时，后端会递归同步子节点 scope，避免父子跨空间导致树结构异常。

价值：同一个系统内可以同时管理“团队公共资料”和“个人草稿/私有资料”。

相关文件：

- `apps/api/internal/model/model.go`
- `apps/api/internal/handler/handler.go`
- `apps/api/internal/handler/ai_reorder.go`
- `apps/web/src/components/DocTree.tsx`
- `apps/web/src/store/docs.ts`

### 3. API 默认登录保护

上游 `/api` 路由中很多能力按单点 handler 自行鉴权。本地二开把主业务 API group 调整为统一 `AuthRequired`：

- `/api/nodes`
- `/api/docs`
- `/api/ai`
- `/api/mcp`
- `/api/admin`

同时保留公开接口：

- `GET /api/shares/:token`
- `GET /api/public/docs/:id`
- 文档静态资源根据登录态、公开状态或分享 token 判断访问权限。

价值：默认收紧访问面，减少未登录用户直接枚举/读取内部文档的风险。

相关文件：

- `apps/api/cmd/server/main.go`
- `apps/api/internal/handler/handler.go`

### 4. 分享和公开访问控制增强

分享逻辑新增和调整：

- 新增 `DOC_HUB_SHARE_TTL_HOURS` 配置，分享链接默认 30 天过期。
- 新增 `DELETE /api/docs/:id/share`，支持撤销分享。
- 静态文档资源访问增加权限判断：
  - 登录用户有读权限；
  - 文档 `visibility=public`；
  - URL 或 Header 带有效 share token。
- 新增 `GET /api/public/docs/:id`，未登录用户可打开公开文档信息。

价值：分享从“只生成链接”升级为“可过期、可撤销、资源层也校验”的访问模型。

相关文件：

- `apps/api/internal/config/config.go`
- `apps/api/internal/handler/handler.go`
- `apps/web/src/components/ShareDialog.tsx`
- `apps/web/src/pages/SharePage.tsx`
- `apps/web/src/pages/HomePage.tsx`

### 5. 编辑锁

新增文档编辑锁机制：

- `Node` 新增 `LockOwner`、`LockUntil`。
- 新增接口：
  - `GET /api/nodes/:id/lock`
  - `POST /api/nodes/:id/lock`
  - `DELETE /api/nodes/:id/lock`
- 写入 HTML、ZIP、删除文件、AI 编辑、保存文件前会检查锁。
- 锁默认 TTL 为 45 秒。
- 文档信息面板可显示当前编辑状态。

价值：多人协作时减少互相覆盖编辑内容的概率。

相关文件：

- `apps/api/internal/model/model.go`
- `apps/api/internal/handler/handler.go`
- `apps/api/internal/handler/ai_reorder.go`
- `apps/web/src/components/DocViewer.tsx`
- `apps/web/src/components/NodeInfoDialog.tsx`

### 6. 用户管理和密码修改

新增普通用户自助改密和管理员创建用户：

- `PATCH /api/auth/password`
- `GET /api/admin/users`
- `POST /api/admin/users`
- 新增 `AdminRequired` 中间件。
- 首个注册用户仍可作为管理员，关闭注册后可由管理员继续创建用户。

价值：更适合内部部署，不依赖开放注册来扩充用户。

相关文件：

- `apps/api/internal/handler/auth_handler.go`
- `apps/web/src/components/ChangePasswordDialog.tsx`
- `apps/web/src/components/UserManagementDialog.tsx`
- `apps/web/src/components/UserMenu.tsx`
- `apps/web/src/lib/api.ts`

### 7. MCP 隔离增强

MCP 相关能力改为按 token owner 隔离：

- MCP token 只列出、删除当前用户自己的 token。
- MCP Bearer token 鉴权后会返回 ownerID。
- MCP 工具 list/get/read/create/upload/delete 都限制在 token 所属用户的数据内。
- MCP server name 和 instructions 更新为 `doc-hub`，并说明入口可为 `index.html`、`index.md` 或用户选择的入口文件。

价值：让 MCP 接入适配多用户内部系统，避免一个 token 操作到其他用户文档。

相关文件：

- `apps/api/internal/handler/mcp.go`
- `apps/web/src/components/AISettingsDialog.tsx`

## 前端体验变化

### 1. 文档树分区

文档树从单一树改为“公共 / 个人”两个分区：

- 公共区：登录用户可见。
- 个人区：仅自己可见。
- 每个分区有独立根目录投放区。
- 新建按钮会把当前分区 scope 带给后端。
- 拖拽到文件夹行时默认放入文件夹，更符合直觉。
- 拖拽到根目录时可移动到对应公共/个人分区。

相关文件：

- `apps/web/src/components/DocTree.tsx`
- `apps/web/src/store/docs.ts`

### 2. Markdown 支持

新增 Markdown 文档体验：

- 单文件上传支持 `.md`。
- 粘贴内容时会识别 HTML / Markdown。
- ZIP 入口文件优先支持 `index.html`、`index.htm`、`index.md`、`README.md`。
- 新增 `MarkdownPreview`，基于 `marked` 渲染 Markdown。
- 引入 `highlight.js` 做代码高亮。
- Markdown 资源相对路径会解析到对应文档资源 URL。
- 渲染后做基础 HTML 清洗，移除 script、iframe、form、事件属性等。

价值：项目从“HTML 文档站”扩展成“HTML + Markdown + 静态项目”的内部文档管理工具。

相关文件：

- `apps/web/src/components/CreateDocDialog.tsx`
- `apps/web/src/components/MarkdownPreview.tsx`
- `apps/web/src/components/DocViewer.tsx`
- `apps/web/package.json`

### 3. 文档查看器增强

`DocViewer` 增强点包括：

- 支持 Markdown 入口文件预览。
- 配合编辑锁，编辑前申请锁，保存/上传/删除前校验锁。
- 支持删除非入口文件。
- 支持显示文档信息。
- 支持 chromeless 模式，给未登录公开文档访问使用。
- 分享、公开访问、登录访问之间的 URL 处理更细。

相关文件：

- `apps/web/src/components/DocViewer.tsx`
- `apps/web/src/components/NodeInfoDialog.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/SharePage.tsx`

### 4. 分享页从跳转改为直接嵌入

上游分享页会解析 token 后把共享文档塞到 store，再跳转到 `/v/:docId`。本地二开改为：

- `/s/:token` 直接渲染 iframe。
- iframe URL 带 share token。
- 不依赖登录态或主站 store。

价值：分享页更独立，打开链路更短，也避免未登录分享访问被主站路由误判。

相关文件：

- `apps/web/src/pages/SharePage.tsx`
- `apps/web/src/lib/api.ts`

### 5. 未登录公开文档访问

未登录用户访问 `/v/:docId` 时：

- 如果文档公开，直接使用 chromeless 查看器展示。
- 如果不是公开文档，提示登录。
- 登录后如果原本在文档路由，会刷新以重新加载权限内数据。

价值：公开文档可直接当外部页面分享，私有文档仍保持登录保护。

相关文件：

- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/store/auth.ts`
- `apps/web/src/lib/api.ts`

### 6. 用户侧功能入口

用户菜单新增：

- 修改密码。
- 管理员用户管理入口。

侧边栏状态也从默认关闭改成持久化保存：

- localStorage key：`doc-hub.sidebarOpen`
- 登录、注册、登出时重置侧边栏偏好。

相关文件：

- `apps/web/src/components/UserMenu.tsx`
- `apps/web/src/components/ChangePasswordDialog.tsx`
- `apps/web/src/components/UserManagementDialog.tsx`
- `apps/web/src/store/docs.ts`
- `apps/web/src/store/auth.ts`

## 部署与运维变化

### 1. 环境变量统一改为 DOC_HUB 前缀

上游使用 `WEBDOC_*`，本地二开统一为：

- `DOC_HUB_ADDR`
- `DOC_HUB_STORAGE`
- `DOC_HUB_WEB_ROOT`
- `DOC_HUB_ORIGIN`
- `DOC_HUB_JWT_SECRET`
- `DOC_HUB_DISABLE_REGISTER`
- `DOC_HUB_SHARE_TTL_HOURS`
- `DOC_HUB_DSN`
- `DOC_HUB_PG_*`

相关文件：

- `apps/api/internal/config/config.go`
- `.env.example`
- `Dockerfile`
- `docker-compose.yml`

### 2. Docker Compose 更适合直接运行

本地二开后的 compose 调整：

- `name: doc-hub`
- 容器名改为 `doc-hub-postgres`、`doc-hub-server`
- 镜像名改为 `doc-hub:latest`
- 默认不再包含上游 compose 中引用的 nginx 服务和缺失 nginx 配置。
- 默认绑定 `127.0.0.1:8787`，避免一启动就暴露到局域网/公网。
- 支持通过 `.env` 改成 `0.0.0.0` 或指定公网域名。
- volume 显式命名为 `doc-hub_pgdata`、`doc-hub_docs`。

价值：降低本地/PyCharm/Docker Desktop 启动失败概率，同时默认更保守。

相关文件：

- `docker-compose.yml`
- `.env.example`
- `INTERNAL_NOTES.md`

### 3. 文档补充

README 与内部说明更新为 Doc-Hub 语境，补充：

- Docker Compose 部署步骤。
- `.env` 使用方式。
- 本地、局域网、公网部署差异。
- 注册开关和首个管理员说明。
- 分享链接过期时间说明。
- 内部访问模型说明。

相关文件：

- `README.md`
- `README.zh-CN.md`
- `INTERNAL_NOTES.md`
- `.env.example`

## 新增文件

- `.env.example`
- `INTERNAL_NOTES.md`
- `apps/web/package-lock.json`
- `apps/web/src/components/ChangePasswordDialog.tsx`
- `apps/web/src/components/MarkdownPreview.tsx`
- `apps/web/src/components/NodeInfoDialog.tsx`
- `apps/web/src/components/UserManagementDialog.tsx`

## 主要修改文件

后端：

- `apps/api/cmd/server/main.go`
- `apps/api/internal/config/config.go`
- `apps/api/internal/db/db.go`
- `apps/api/internal/handler/handler.go`
- `apps/api/internal/handler/auth_handler.go`
- `apps/api/internal/handler/ai_reorder.go`
- `apps/api/internal/handler/mcp.go`
- `apps/api/internal/model/model.go`
- `apps/api/internal/model/seed.go`
- `apps/api/internal/storage/storage.go`

前端：

- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/SharePage.tsx`
- `apps/web/src/components/DocTree.tsx`
- `apps/web/src/components/DocViewer.tsx`
- `apps/web/src/components/CreateDocDialog.tsx`
- `apps/web/src/components/ShareDialog.tsx`
- `apps/web/src/components/UserMenu.tsx`
- `apps/web/src/components/AISettingsDialog.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/store/auth.ts`
- `apps/web/src/store/docs.ts`

部署和元信息：

- `Dockerfile`
- `docker-compose.yml`
- `package.json`
- `apps/web/package.json`
- `README.md`
- `README.zh-CN.md`

## 可以概括成的产品迭代点

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

