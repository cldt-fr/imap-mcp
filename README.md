# imap-mcp

> Self-hosted remote **MCP server** that lets an AI (Claude, etc.) read, search and send email through **multiple IMAP/SMTP accounts**, authenticated via **Clerk**.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-2025--06--18-green)](https://modelcontextprotocol.io)

---

## Why

MCP clients (Claude Desktop, Claude.ai, …) can talk to remote servers, but none of them ship with a way to plug **your own** IMAP/SMTP accounts securely. Shoving raw credentials into a client config or shipping them to a third-party SaaS is a non-starter for anything serious.

`imap-mcp` is a tiny, self-hosted Next.js app that:

- authenticates **humans** with Clerk (you get a real sign-in UI, MFA, SSO, whatever Clerk supports),
- authenticates **MCP clients** with OAuth 2.1 (PKCE + Dynamic Client Registration),
- stores an **arbitrary number of IMAP/SMTP accounts** per user, encrypted at rest (AES-256-GCM),
- exposes those accounts to any MCP client through a clean set of tools.

One container, one domain, your server, your keys.

## Features

- 🔐 **Clerk** for user auth — you manage users, not us
- 🔑 **OAuth 2.1** (Authorization Code + PKCE) with **Dynamic Client Registration** (RFC 7591)
- 📬 Unlimited IMAP/SMTP accounts per user, each with its own **HTML signature** (Tiptap editor, DOMPurify-sanitized)
- 🔒 Credentials encrypted with **AES-256-GCM**; OAuth tokens stored as **SHA-256** hashes only
- 🧰 7 MCP tools: `list_accounts`, `list_folders`, `list_messages`, `get_message`, `search_messages`, `send_message`, `reply_message`
- 🧪 "Test connection" button per account (IMAP `NOOP` + SMTP `VERIFY`)
- 🐳 Ships as a 2-service `docker-compose` (Postgres + app)

## Architecture

```
┌─────────────────┐   OAuth 2.1 (PKCE + DCR)   ┌──────────────────────────┐
│   MCP client    │ ◀────────────────────────▶ │  /api/oauth/*            │
│ (Claude, …)     │   Bearer-auth'd JSON-RPC   │  /api/mcp   ← tools      │
└─────────────────┘                            │                          │
                                               │   Next.js 15 (App Router)│
┌─────────────────┐   Clerk session            │   /accounts  ← web UI    │
│     Browser     │ ─────────────────────────▶ │                          │
└─────────────────┘                            └──────────────┬───────────┘
                                                              │ Drizzle
                                                        ┌─────▼─────┐
                                                        │ Postgres  │
                                                        └───────────┘
```

The Next.js app is simultaneously:

- the **OAuth Authorization Server** (issues codes and tokens),
- the **OAuth Resource Server** (validates Bearer tokens at `/api/mcp`),
- the **web UI** for users to manage their accounts.

Human auth at the `/authorize` endpoint is delegated to the active Clerk session.

## Stack

| Concern      | Choice                                                  |
| ------------ | ------------------------------------------------------- |
| Framework    | Next.js 15 (App Router), React 19                       |
| Language     | TypeScript (strict)                                     |
| Human auth   | [`@clerk/nextjs`](https://clerk.com)                    |
| Database     | PostgreSQL 16                                           |
| ORM          | [`drizzle-orm`](https://orm.drizzle.team)               |
| IMAP client  | [`imapflow`](https://github.com/postalsys/imapflow)     |
| SMTP client  | [`nodemailer`](https://nodemailer.com)                  |
| MCP SDK      | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) |
| HTML editor  | [Tiptap](https://tiptap.dev)                            |
| Sanitizer    | [`isomorphic-dompurify`](https://github.com/kkomelin/isomorphic-dompurify) |
| Transport    | **Streamable HTTP** (MCP spec 2025-06-18)               |

## Getting started

### 1. Clone & configure

```bash
git clone <your-fork> imap-mcp
cd imap-mcp
cp .env.example .env
```

Fill in `.env`:

```bash
# Generate a fresh 32-byte master key
openssl rand -base64 32
```

Paste it as `MCP_MASTER_KEY`. Add your Clerk keys (`pk_test_…` / `sk_test_…`) and set `NEXT_PUBLIC_APP_URL` to the public URL of your deployment (e.g. `https://mcp.example.com` or `http://localhost:3000` for local).

⚠️ **Losing `MCP_MASTER_KEY` means losing every stored IMAP/SMTP password.** Back it up.

### 2. Run with Docker

```bash
docker compose up --build
# In another terminal, apply the schema on first install:
docker compose exec app npx drizzle-kit push
```

App is now available at `http://localhost:3000`.

### 3. Add an email account

1. Open the app, sign up with Clerk.
2. Go to **`/accounts/new`**.
3. Fill IMAP + SMTP details. Gmail / Google Workspace: use an **app password** (`https://myaccount.google.com/apppasswords`).
4. Optionally paste/edit an HTML signature.
5. Save, then **Test connection**.

### 4. Connect your MCP client

Point your MCP-compatible client at:

```
https://<your-domain>/api/mcp
```

(or `http://localhost:3000/api/mcp` for local)

The client will:

1. `GET /.well-known/oauth-protected-resource` — discover the auth server,
2. `POST /api/oauth/register` — auto-register itself,
3. open `/api/oauth/authorize` in a browser — you sign in with Clerk and approve,
4. `POST /api/oauth/token` — exchange the code for an access token,
5. call `/api/mcp` with `Authorization: Bearer …`.

All of this is handled transparently by conformant MCP clients.

## MCP tools

| Tool              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `list_accounts`   | List the current user's configured accounts                             |
| `list_folders`    | IMAP `LIST` — all mailboxes for a given account                         |
| `list_messages`   | Headers of the N most recent messages in a folder (with filters)        |
| `get_message`     | Full message: headers, text, HTML, attachments metadata                 |
| `search_messages` | IMAP `SEARCH` by `from`, `to`, `subject`, `body`, date ranges, unread   |
| `send_message`    | Send via the account's SMTP, optionally appending the HTML signature    |
| `reply_message`   | Reply preserving `In-Reply-To` / `References`, with optional quoting    |

The authenticated user's ID is always injected from the OAuth token — tools never accept it as an argument, so a client cannot impersonate another user.

## Local development

```bash
npm install
# Start postgres however you want (docker, local, …) and export DATABASE_URL
npm run db:push          # apply schema
npm run dev              # Next.js dev server on :3000
npm run typecheck        # strict TypeScript
npm run build            # production build
```

## Data model

```
users(id, clerk_user_id UNIQUE)
mail_accounts(id, user_id, label, email,
              imap_{host,port,secure,user,password_enc},
              smtp_{host,port,secure,user,password_enc},
              signature_html, is_default)
oauth_clients(id, client_secret_hash, redirect_uris[], token_endpoint_auth_method)
oauth_auth_codes(code, client_id, user_id, redirect_uri,
                 code_challenge, code_challenge_method, expires_at, consumed_at)
oauth_tokens(id, access_token_hash UNIQUE, refresh_token_hash,
             client_id, user_id, access_expires_at, refresh_expires_at, revoked_at)
```

## Security notes

- Master key: AES-256-GCM, IV per ciphertext, authenticated. Ciphertext = `base64(iv(12) ‖ ct ‖ tag(16))`.
- Passwords are never returned from the REST API — only their encrypted blob is stored.
- Access tokens are **opaque** random strings; DB stores only their SHA-256.
- Refresh tokens rotate on every use (old one is revoked).
- Signatures pass through DOMPurify server-side before storage *and* before being injected into outgoing mail.
- The `/api/mcp` endpoint always returns `WWW-Authenticate: Bearer resource_metadata="…"` on 401, per RFC 9728.

## Out of scope (v1)

- XOAUTH2 for Gmail / Outlook (password/app-password only for now)
- IMAP IDLE / push notifications
- Binary attachment download via MCP (v1 lists names/sizes only)
- Master-key rotation flow (schema supports it, tool not written yet)
- Per-user rate limiting on MCP tools

PRs welcome for any of the above.

## Contributing

Issues and PRs are welcome. Before opening a PR, please:

1. `npm run typecheck` must pass.
2. `npm run build` must pass.
3. Keep the monolith mindset: one Next.js app, one container, boring dependencies.

## License

[MIT](LICENSE) — do whatever you want, no warranty.
