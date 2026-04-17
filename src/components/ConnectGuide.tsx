"use client";

import { useState } from "react";
import { CopyBlock, CopyButton } from "./CopyButton";

type Target = "claude-web" | "claude-desktop" | "claude-code";

export function ConnectGuide({ mcpUrl }: { mcpUrl: string }) {
  const [tab, setTab] = useState<Target>("claude-web");

  const desktopConfig = JSON.stringify(
    {
      mcpServers: {
        "email-mcp": {
          command: "npx",
          args: ["-y", "mcp-remote", mcpUrl],
        },
      },
    },
    null,
    2,
  );

  const codeCmd = `claude mcp add --transport http email-mcp ${mcpUrl}`;

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab ${tab === "claude-web" ? "active" : ""}`}
          onClick={() => setTab("claude-web")}
          type="button"
        >
          Claude.ai (web)
        </button>
        <button
          className={`tab ${tab === "claude-desktop" ? "active" : ""}`}
          onClick={() => setTab("claude-desktop")}
          type="button"
        >
          Claude Desktop
        </button>
        <button
          className={`tab ${tab === "claude-code" ? "active" : ""}`}
          onClick={() => setTab("claude-code")}
          type="button"
        >
          Claude Code
        </button>
      </div>

      {tab === "claude-web" && (
        <ol className="step-list">
          <li>
            <div className="step-body">
              <p>
                On <a href="https://claude.ai" target="_blank" rel="noreferrer">claude.ai</a>,
                open <strong>Settings → Connectors</strong>.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Click <strong>&ldquo;Add custom connector&rdquo;</strong>.</p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Paste the MCP server URL:</p>
              <CopyBlock value={mcpUrl} />
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Give it a name (e.g. <em>Email</em>) and confirm. Claude opens a Clerk
                window so you can sign in to this server — approve the access.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                In a new conversation, enable the connector from the tools palette.
                You can now ask: &ldquo;List my 10 most recent emails.&rdquo;
              </p>
            </div>
          </li>
        </ol>
      )}

      {tab === "claude-desktop" && (
        <ol className="step-list">
          <li>
            <div className="step-body">
              <p>
                In Claude Desktop, open <strong>Settings → Developer →
                Edit Config</strong> (macOS:
                <code> ~/Library/Application Support/Claude/claude_desktop_config.json</code>).
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Merge this entry into your config file:</p>
              <pre className="code-block">
                <code>{desktopConfig}</code>
                <CopyButton value={desktopConfig} />
              </pre>
              <p className="muted" style={{ fontSize: 13 }}>
                The <code>mcp-remote</code> bridge handles OAuth 2.1 for versions of
                Claude Desktop that don&apos;t yet speak HTTP MCP directly. Node.js ≥ 18
                required.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Restart Claude Desktop. A browser window opens automatically for the
                first connection — sign in with Clerk and authorize.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                The tools hammer in the composer now shows <strong>email-mcp</strong>
                with 17 tools (list, search, send, flag, move, …).
              </p>
            </div>
          </li>
        </ol>
      )}

      {tab === "claude-code" && (
        <ol className="step-list">
          <li>
            <div className="step-body">
              <p>From a terminal, run:</p>
              <CopyBlock value={codeCmd} />
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Launch <code>claude</code>, then type <kbd>/mcp</kbd> — you&apos;ll see
                <strong> email-mcp</strong> in the list. The first tool call triggers
                the OAuth flow: approve in the browser.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                To remove it later:{" "}
                <code>claude mcp remove email-mcp</code>.
              </p>
            </div>
          </li>
        </ol>
      )}
    </div>
  );
}
