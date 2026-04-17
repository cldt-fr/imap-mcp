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
                Sur <a href="https://claude.ai" target="_blank" rel="noreferrer">claude.ai</a>,
                ouvre <strong>Paramètres → Connecteurs</strong>.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Clique sur <strong>&ldquo;Ajouter un connecteur personnalisé&rdquo;</strong>.</p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Colle l&apos;URL du serveur MCP :</p>
              <CopyBlock value={mcpUrl} />
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Donne-lui un nom (par ex. <em>Email</em>), puis valide. Claude ouvrira une fenêtre
                Clerk pour que tu t&apos;authentifies sur ce serveur : accepte l&apos;accès.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Dans une nouvelle conversation, active le connecteur depuis la palette
                d&apos;outils. Tu peux maintenant demander :
                &ldquo;Liste mes 10 derniers mails&rdquo;.
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
                Dans Claude Desktop, ouvre <strong>Settings → Developer →
                Edit Config</strong> (macOS :
                <code> ~/Library/Application Support/Claude/claude_desktop_config.json</code>).
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Fusionne cette entrée avec ton fichier :</p>
              <pre className="code-block">
                <code>{desktopConfig}</code>
                <CopyButton value={desktopConfig} />
              </pre>
              <p className="muted" style={{ fontSize: 13 }}>
                Le pont <code>mcp-remote</code> gère OAuth 2.1 pour les versions de Claude Desktop
                qui ne parlent pas encore HTTP directement. Node.js ≥ 18 requis.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>Redémarre Claude Desktop. Une fenêtre de navigateur s&apos;ouvre automatiquement pour la première connexion : signe-toi avec Clerk et autorise.</p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Dans l&apos;interface, le marteau d&apos;outils affiche maintenant
                <strong> email-mcp</strong> avec 7 tools (list, search, send, …).
              </p>
            </div>
          </li>
        </ol>
      )}

      {tab === "claude-code" && (
        <ol className="step-list">
          <li>
            <div className="step-body">
              <p>Depuis un terminal, exécute :</p>
              <CopyBlock value={codeCmd} />
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Lance <code>claude</code>, puis tape <kbd>/mcp</kbd> — tu verras
                <strong> email-mcp</strong> dans la liste. Le premier appel déclenche le
                flux OAuth : valide dans le navigateur.
              </p>
            </div>
          </li>
          <li>
            <div className="step-body">
              <p>
                Pour supprimer plus tard :{" "}
                <code>claude mcp remove email-mcp</code>.
              </p>
            </div>
          </li>
        </ol>
      )}
    </div>
  );
}
