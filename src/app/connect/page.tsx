import Link from "next/link";
import { ConnectGuide } from "@/components/ConnectGuide";
import { CopyBlock } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default function ConnectPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mcpUrl = `${baseUrl}/api/mcp`;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link href="/accounts" className="muted">
          ← Back to accounts
        </Link>
      </div>

      <div className="stack-lg stack">
        <div>
          <h2 style={{ marginBottom: 6 }}>Connect to Claude</h2>
          <p className="muted">
            Set up Claude to read and send email through this MCP server. Authentication
            uses OAuth 2.1 (Clerk) — no IMAP password is ever shared with Claude.
          </p>
        </div>

        <div className="card">
          <div className="row row-between" style={{ marginBottom: 8 }}>
            <strong>MCP server URL</strong>
            <span className="badge badge-soft">Bearer + PKCE</span>
          </div>
          <CopyBlock value={mcpUrl} />
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            This URL is all you need: conformant MCP clients discover the authorization
            server, register via DCR, and run the OAuth flow automatically.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Steps for your client</h3>
          <ConnectGuide mcpUrl={mcpUrl} />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Try it out</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Once connected, ask Claude one of these:
          </p>
          <ul
            className="stack-sm stack"
            style={{ listStyle: "disc", paddingLeft: 18, color: "var(--fg-soft)" }}
          >
            <li>“List my email accounts.”</li>
            <li>“Show me the 5 most recent unread messages in my inbox.”</li>
            <li>
              “Find emails from <em>invoices@</em> over the last month.”
            </li>
            <li>
              “Reply to this thread saying I&apos;m available Thursday at 3pm.”
            </li>
            <li>
              “Archive all newsletters from last week into an <em>Archive/2026</em> folder.”
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Requirements</h3>
          <ul
            className="stack-sm stack"
            style={{ listStyle: "disc", paddingLeft: 18, color: "var(--fg-soft)" }}
          >
            <li>
              At least <strong>one IMAP/SMTP account configured</strong> —
              <Link href="/accounts/new"> add one</Link>.
            </li>
            <li>
              The <em>Test</em> button on the list must turn green for both IMAP and SMTP.
            </li>
            <li>
              Gmail / Google Workspace: create an{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
              >
                app password
              </a>
              .
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
