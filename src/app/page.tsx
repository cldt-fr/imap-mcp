import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { CopyBlock } from "@/components/CopyButton";

export default function HomePage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mcpUrl = `${baseUrl}/api/mcp`;

  return (
    <div className="container">
      <nav className="topnav">
        <Link href="/" className="topnav-brand">
          <span className="topnav-logo">@</span>
          <span>IMAP MCP</span>
        </Link>
        <div className="topnav-links">
          <SignedIn>
            <Link href="/accounts" className="btn btn-ghost btn-sm">
              My accounts
            </Link>
            <Link href="/connect" className="btn btn-ghost btn-sm">
              Connect to Claude
            </Link>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-primary btn-sm">Sign in</button>
            </SignInButton>
          </SignedOut>
        </div>
      </nav>

      <section className="hero">
        <h1>Your email, plugged into Claude.</h1>
        <p>
          A self-hosted MCP server that exposes your IMAP/SMTP accounts to Claude and
          any other MCP-compatible client — securely, without ever sharing your passwords.
        </p>
        <div className="hero-actions">
          <SignedIn>
            <Link href="/accounts" className="btn btn-primary">
              Manage my accounts →
            </Link>
            <Link href="/connect" className="btn">
              Connect to Claude
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-primary">Get started</button>
            </SignInButton>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              What is MCP?
            </a>
          </SignedOut>
        </div>
      </section>

      <div className="stack stack-lg" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row row-between" style={{ marginBottom: 8 }}>
            <strong>MCP server URL</strong>
            <span className="badge badge-soft">OAuth 2.1 · PKCE</span>
          </div>
          <CopyBlock value={mcpUrl} />
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Paste this URL into Claude.ai (Settings → Connectors), Claude Desktop or
            Claude Code. The client auto-registers through DCR.
          </p>
        </div>

        <div className="grid-2">
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🔐 Strong authentication</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Humans via Clerk (MFA, SSO). MCP clients via OAuth 2.1 + PKCE + DCR.
              IMAP passwords encrypted at rest with AES-256-GCM.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>📬 Multi-account</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Unlimited IMAP/SMTP accounts per user, each with its own HTML signature.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🧰 17 MCP tools</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Read, search, send, reply, flag, move, copy, delete, and manage folders —
              everything Claude needs to triage your inbox.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🐳 Self-hosted</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              One Next.js container plus Postgres. Your server, your keys, your domain.
            </p>
          </div>
        </div>

        <SignedIn>
          <div className="card">
            <div className="row row-between">
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Ready to connect Claude?
                </strong>
                <span className="muted" style={{ fontSize: 14 }}>
                  Step-by-step guide for Claude.ai, Claude Desktop and Claude Code.
                </span>
              </div>
              <Link href="/connect" className="btn btn-primary">
                Open guide →
              </Link>
            </div>
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
