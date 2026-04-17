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
          ← Retour aux comptes
        </Link>
      </div>

      <div className="stack-lg stack">
        <div>
          <h2 style={{ marginBottom: 6 }}>Connecter à Claude</h2>
          <p className="muted">
            Configure Claude pour qu&apos;il lise et envoie tes emails via ce serveur MCP.
            L&apos;authentification passe par OAuth 2.1 (Clerk), aucun mot de passe n&apos;est
            partagé avec Claude.
          </p>
        </div>

        <div className="card">
          <div className="row row-between" style={{ marginBottom: 8 }}>
            <strong>URL du serveur MCP</strong>
            <span className="badge badge-soft">Bearer + PKCE</span>
          </div>
          <CopyBlock value={mcpUrl} />
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Cette seule URL suffit : les clients MCP conformes découvrent automatiquement
            l&apos;authorization server, s&apos;enregistrent via DCR et lancent le flux OAuth.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Étapes selon ton client</h3>
          <ConnectGuide mcpUrl={mcpUrl} />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Tester l&apos;intégration</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Une fois connecté, essaie une de ces demandes dans Claude :
          </p>
          <ul
            className="stack-sm stack"
            style={{ listStyle: "disc", paddingLeft: 18, color: "var(--fg-soft)" }}
          >
            <li>« Liste mes comptes email. »</li>
            <li>« Montre-moi les 5 derniers mails non lus dans l&apos;Inbox. »</li>
            <li>
              « Recherche les emails de <em>factures@</em> du mois dernier. »
            </li>
            <li>
              « Réponds à ce mail en disant que je suis disponible jeudi à 15h. »
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Prérequis</h3>
          <ul
            className="stack-sm stack"
            style={{ listStyle: "disc", paddingLeft: 18, color: "var(--fg-soft)" }}
          >
            <li>
              Au moins <strong>un compte IMAP/SMTP configuré</strong> —
              <Link href="/accounts/new"> en ajouter un</Link>.
            </li>
            <li>
              Le bouton <em>Tester</em> sur la liste doit passer au vert pour IMAP et SMTP.
            </li>
            <li>
              Pour Gmail / Google Workspace : créer un{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
              >
                mot de passe d&apos;application
              </a>
              .
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
