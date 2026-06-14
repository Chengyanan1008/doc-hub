# Doc-Hub Internal Build

This fork is tuned for internal use.

## Deployment

Copy `.env.example` to `.env` and edit it.

Local-only:

```bash
DOC_HUB_BIND_ADDR=127.0.0.1
DOC_HUB_ORIGIN=http://localhost:8787,http://127.0.0.1:8787
```

Public domain:

```bash
DOC_HUB_BIND_ADDR=0.0.0.0
DOC_HUB_ORIGIN=https://docs.example.com
DOC_HUB_JWT_SECRET=<a long random secret>
```

Then run:

```bash
docker compose up -d --build
```

## Start In PyCharm

You do not need to run Go manually. Use Docker Compose from PyCharm.

1. Open this directory in PyCharm:

```text
doc-hub
```

2. Make sure Docker Desktop is running.

3. Open PyCharm Terminal and start the stack:

```bash
docker compose up -d --build
```

4. Open the app:

```text
http://localhost:8787
```

5. For the first run, keep this in `.env` so you can register the first admin user:

```env
DOC_HUB_DISABLE_REGISTER=0
```

The first registered user becomes admin automatically. After that, admins can
create users from the avatar menu's User Management entry. If more users need
to self-register later, temporarily keep or switch back to:

```env
DOC_HUB_DISABLE_REGISTER=0
```

After those users have registered, change it back to:

```env
DOC_HUB_DISABLE_REGISTER=1
```

Then restart:

```bash
docker compose up -d
```

Useful commands:

```bash
docker compose logs -f server
docker compose down
```

## Access Model

- `private`: only the owner can open the document directly. A generated share link still allows unauthenticated viewers who have the token.
- `public`: unauthenticated users can open the document asset URL directly.
- Share links are explicit public links and expire after `DOC_HUB_SHARE_TTL_HOURS`.

## Changes From Upstream

- All document, AI settings, prompt, and MCP token data is scoped by user owner.
- Node APIs require login.
- MCP tokens are scoped to the user who created them.
- Static document assets require owner login, public visibility, or a valid share token.
- Docker Compose no longer references missing nginx files and defaults to local-only binding.
- CORS and public binding are environment-driven for domain deployment.
- ZIP upload has file count and expanded-size limits.
