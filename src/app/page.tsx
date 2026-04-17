import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <div className="container">
      <div className="header">
        <h1 style={{ fontSize: 20 }}>IMAP MCP</h1>
        <div>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-primary">Se connecter</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Serveur MCP IMAP multi-comptes</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Configure tes comptes email IMAP/SMTP et expose-les à Claude ou tout autre client MCP
          compatible.
        </p>
        <SignedIn>
          <Link href="/accounts" className="btn btn-primary">
            Gérer mes comptes →
          </Link>
        </SignedIn>
        <SignedOut>
          <p className="muted">Connecte-toi pour commencer.</p>
        </SignedOut>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>URL du serveur MCP</h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          Configure cette URL dans ton client MCP (Claude Desktop, etc.) :
        </p>
        <code
          style={{
            display: "block",
            padding: 12,
            background: "var(--input-bg)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          {(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/api/mcp"}
        </code>
      </div>
    </div>
  );
}
