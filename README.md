# Doc-Hub

**Language / 语言**: **English** · [中文](./README.zh-CN.md)

Doc-Hub is an internal document, page, and static project management platform. It supports upload, editing, preview, AI generation, permissioned sharing, public/personal workspaces, and edit locks for multi-user internal use. It is designed to grow beyond HTML and Markdown to spreadsheets, office documents, presentations, and other internal file types.

---

## Features

- Public workspace: visible to all logged-in users.
- Personal workspace: visible only to the owner.
- Folder and document tree with rename, delete, sorting, and drag/drop moves.
- Single-file HTML upload or paste.
- Single-file Markdown upload or paste with rendered preview.
- Multi-file ZIP upload with HTML, Markdown, and static assets. A top-level `index.html` is used automatically; otherwise users can choose an `.html` or `.md` entry file such as `index.md` or `README.md`.
- Monaco editor with preview, split, and code modes.
- Live preview reload through WebSocket file watching.
- Sandboxed iframe preview under `/d/{docId}/`.
- Markdown entry files render automatically in preview, split, and sharing views.
- File information dialog with uploader/editor and timestamp details.
- Edit lock: only one user can edit a document at a time.
- JWT username/password auth.
- Personal password change from the avatar menu.
- Optional registration lock through `DOC_HUB_DISABLE_REGISTER=1`.
- Admin user management for creating regular users or admins while public registration is closed.
- Feishu-like sharing modes: off, link sharing, and internet public.
- OpenAI-compatible AI generation and editing.
- Built-in MCP endpoint for agents.

---

## Sharing Model

Doc-Hub has three sharing states:

- Off: no anonymous access. Only authorized logged-in users can view the document.
- Link sharing: creates `/s/{shareToken}`. Anyone with the token can view it until revoked or expired.
- Internet public: exposes `/v/{docId}` to anonymous visitors. Switch back to Off to revoke.

The public workspace is not internet public. It is only visible to logged-in users.

---

## Project Structure

```text
doc-hub/
├── apps/
│   ├── api/                    # Go backend
│   └── web/                    # React + Vite frontend
├── dist/                       # Local build output
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
└── README.zh-CN.md
```

Go module:

```text
doc-hub/api
```

---

## Start With Docker Compose

After cloning from GitHub:

```bash
git clone <your-repo-url>
cd doc-hub
docker compose up -d --build
```

This quick path uses the safe local defaults in `docker-compose.yml` and enables first admin registration.

For a real shared deployment, create a local `.env` first:

```bash
cd doc-hub
cp .env.example .env
docker compose up -d --build
```

Change `DOC_HUB_JWT_SECRET` in `.env` before sharing the service with others, and keep `.env` out of Git.

Open:

```text
http://127.0.0.1:8787
```

For the first admin registration, keep:

```env
DOC_HUB_DISABLE_REGISTER=0
```

After the first admin account is ready, set:

```env
DOC_HUB_DISABLE_REGISTER=1
```

Then restart:

```bash
docker compose up -d
```

Admins can then use User Management from the avatar menu to create regular users or other admins while public registration is closed.

If you still want users to self-register, temporarily keep or switch back to:

```env
DOC_HUB_DISABLE_REGISTER=0
```

After those users have registered, set:

```env
DOC_HUB_DISABLE_REGISTER=1
```

Then restart. This reduces the risk of unknown users self-registering on a public deployment.

```bash
docker compose up -d
```

Logged-in users can change their own password from the avatar menu: `Change Password`.

---

## PyCharm

Open this directory in PyCharm:

```text
doc-hub
```

Make sure Docker Desktop is running, then use the PyCharm terminal:

```bash
docker compose up -d --build
```

You do not need to run Go manually for normal use.

---

## Public Deployment

Local-only default:

```env
DOC_HUB_BIND_ADDR=127.0.0.1
DOC_HUB_ORIGIN=http://localhost:8787,http://127.0.0.1:8787
```

LAN access example:

```env
DOC_HUB_BIND_ADDR=0.0.0.0
DOC_HUB_ORIGIN=*
```

Then users on the same network can open `http://your-lan-ip:8787`. On macOS, `.local` hostnames may also work, for example `http://LF-0101001077.local:8787`.

Public domain example:

```env
DOC_HUB_BIND_ADDR=0.0.0.0
DOC_HUB_ORIGIN=https://your-domain.example.com
DOC_HUB_JWT_SECRET=<a long random secret>
```

Restart after changes:

```bash
docker compose up -d --build
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DOC_HUB_BIND_ADDR` | `127.0.0.1` | Host bind address. Use `0.0.0.0` for LAN or public deployment. |
| `DOC_HUB_PORT` | `8787` | Host port. |
| `DOC_HUB_ADDR` | `:8787` | Internal Go listen address. |
| `DOC_HUB_STORAGE` | `/data/docs` | Document storage path. |
| `DOC_HUB_WEB_ROOT` | `/app/web` | Built frontend path. |
| `DOC_HUB_ORIGIN` | localhost origins | CORS allow-list. Use `*` for trusted LAN access, or a fixed domain for public deployment. |
| `DOC_HUB_JWT_SECRET` | insecure default | Must be changed for production. |
| `DOC_HUB_DISABLE_REGISTER` | `1` | `1` disables registration, `0` enables it. |
| `DOC_HUB_SHARE_TTL_HOURS` | `720` | Link share expiry in hours. |
| `DOC_HUB_DSN` | empty | Full Postgres DSN. |
| `DOC_HUB_PG_HOST` | `postgres` | Postgres host. |
| `DOC_HUB_PG_PORT` | `5432` | Postgres port. |
| `DOC_HUB_PG_USER` | `doc-hub` | Postgres user. |
| `DOC_HUB_PG_PASSWORD` | `doc-hub` | Postgres password. |
| `DOC_HUB_PG_DB` | `doc-hub` | Postgres database. |
| `DOC_HUB_PG_SSLMODE` | `disable` | Postgres SSL mode. |

---

## Useful Commands

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f server
docker compose down

cd apps/web && npm run build
cd apps/api && go test ./...
npm run build:api
```

---

## AI Configuration

Open Doc-Hub, log in, then click the AI settings button in the sidebar header.

Configure the `Connection / Model` tab:

| Field | Meaning |
|---|---|
| `Base URL` | OpenAI-compatible Chat Completions base URL, for example `https://api.openai.com/v1`. |
| `API Key` | Provider API key. It is stored in your local Doc-Hub database. |
| `Model` | Model name, for example `gpt-4o-mini` or another provider-compatible model. |
| `Temperature` | Generation randomness. |
| `Max Tokens` | Maximum output tokens for one request. |
| `Tool Rounds` | Maximum tool-calling rounds during edit tasks. |
| `Enable Tool Calling` | Allows AI edit tasks to call `list_files`, `read_file`, `write_file`, and `replace_in_file` instead of sending the whole project to the model. The model/provider must support function calling. |

Preset buttons are available for common OpenAI-compatible providers such as OpenAI, DeepSeek, Kimi, Zhipu, Tongyi, OpenRouter, and custom gateways. The AI settings are scoped to the logged-in user.

Prompt templates are managed in the `Skill Management` tab. They control create/edit prompts and are separate from tool calling.

---

## MCP Access

Open `AI Settings -> MCP Access` after logging in.

MCP lets external AI clients use Doc-Hub as a controlled document workspace. After connecting an MCP client such as Claude Desktop, Cursor, or Cline, the client can use your token to list documents, create documents, read files, upload or overwrite HTML/Markdown/CSS/JS files, upload ZIP projects, and delete documents or files.

Typical use cases:

- Ask an external AI client to read a Doc-Hub document and rewrite part of it.
- Generate a new Markdown or HTML document directly into Doc-Hub.
- Let an agent inspect a multi-file static project, edit the right files, and write the changes back.

The built-in web AI is used inside Doc-Hub. MCP is for external AI agents. Deleting an MCP token immediately revokes that external client's access.

1. Copy the MCP endpoint shown in the panel. For a normal local deployment it is usually:

```text
http://127.0.0.1:8787/mcp
```

2. Create an access token in the `Access Token` section. The plaintext token is shown only once, so copy it immediately.
3. Configure your MCP client with:

```text
Authorization: Bearer <YOUR_TOKEN>
```

The MCP endpoint is Streamable HTTP / JSON-RPC 2.0 and supports document operations such as list, create, read, upload, and delete.

For Claude Desktop, Cursor, or Cline, use the generated `mcp-remote` example from the UI. It looks like:

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

If the MCP client runs on another device in the LAN, replace `127.0.0.1` with your LAN IP or macOS `.local` hostname.

---

## API Overview

- `GET /api/auth/public-info`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/nodes`
- `POST /api/nodes`
- `GET /api/nodes/:id`
- `PATCH /api/nodes/:id`
- `DELETE /api/nodes/:id`
- `PATCH /api/nodes/reorder/batch`
- `GET /api/nodes/:id/info`
- `GET /api/nodes/:id/lock`
- `POST /api/nodes/:id/lock`
- `DELETE /api/nodes/:id/lock`
- `POST /api/docs/:id/html` for single-file HTML or Markdown content.
- `POST /api/docs/:id/zip` for multi-file ZIP projects.
- `GET /api/docs/:id/file?path=...`
- `POST /api/docs/:id/file`
- `POST /api/docs/:id/share`
- `DELETE /api/docs/:id/share`
- `GET /api/shares/:token`
- `GET /api/public/docs/:id`
- `GET/PATCH /api/ai/settings`
- `POST /api/ai/generate`
- `GET/POST/PATCH/DELETE /api/ai/prompts`
- `GET/POST/DELETE /api/mcp/tokens`
- `POST /mcp`

---

## Data Volumes

Docker Compose uses:

```text
doc-hub_pgdata
doc-hub_docs
```

Removing these volumes deletes all database and uploaded document data.
