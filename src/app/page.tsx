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
              Mes comptes
            </Link>
            <Link href="/connect" className="btn btn-ghost btn-sm">
              Connecter à Claude
            </Link>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-primary btn-sm">Se connecter</button>
            </SignInButton>
          </SignedOut>
        </div>
      </nav>

      <section className="hero">
        <h1>Tes emails, branchés sur Claude.</h1>
        <p>
          Serveur MCP auto-hébergé qui expose tes comptes IMAP/SMTP à Claude et aux autres
          clients MCP — en toute sécurité, sans partager tes mots de passe.
        </p>
        <div className="hero-actions">
          <SignedIn>
            <Link href="/accounts" className="btn btn-primary">
              Gérer mes comptes →
            </Link>
            <Link href="/connect" className="btn">
              Connecter à Claude
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-primary">Commencer</button>
            </SignInButton>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Qu&apos;est-ce que MCP ?
            </a>
          </SignedOut>
        </div>
      </section>

      <div className="stack stack-lg" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row row-between" style={{ marginBottom: 8 }}>
            <strong>URL du serveur MCP</strong>
            <span className="badge badge-soft">OAuth 2.1 · PKCE</span>
          </div>
          <CopyBlock value={mcpUrl} />
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Colle cette URL dans Claude.ai (Paramètres → Connecteurs), Claude Desktop ou
            Claude Code. Le client s&apos;enregistrera automatiquement via DCR.
          </p>
        </div>

        <div className="grid-2">
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🔐 Authentification forte</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Humains via Clerk (MFA, SSO). Clients MCP via OAuth 2.1 + PKCE + DCR. Mots de
              passe IMAP chiffrés AES-256-GCM au repos.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>📬 Multi-comptes</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Nombre illimité de comptes IMAP/SMTP par utilisateur, chacun avec sa propre
              signature HTML.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🧰 7 outils MCP</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              list_accounts, list_folders, list_messages, get_message, search_messages,
              send_message, reply_message.
            </p>
          </div>
          <div className="card card-hover">
            <h3 style={{ marginBottom: 6 }}>🐳 Self-hosted</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Un seul container Next.js + Postgres. Ton serveur, tes clés, ton domaine.
            </p>
          </div>
        </div>

        <SignedIn>
          <div className="card">
            <div className="row row-between">
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Prêt à connecter Claude ?
                </strong>
                <span className="muted" style={{ fontSize: 14 }}>
                  Guide pas à pas pour Claude.ai, Claude Desktop et Claude Code.
                </span>
              </div>
              <Link href="/connect" className="btn btn-primary">
                Voir le guide →
              </Link>
            </div>
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
