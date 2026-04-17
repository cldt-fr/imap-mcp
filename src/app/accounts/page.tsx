import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const userId = await getCurrentUserRowId();
  const accounts = await db
    .select({
      id: mailAccounts.id,
      label: mailAccounts.label,
      email: mailAccounts.email,
      imapHost: mailAccounts.imapHost,
      isDefault: mailAccounts.isDefault,
    })
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(mailAccounts.createdAt);

  return (
    <div>
      <div className="header">
        <h2>Mes comptes email</h2>
        <Link href="/accounts/new" className="btn btn-primary">
          + Ajouter un compte
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card">
          <p className="muted">Aucun compte configuré.</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Ajoute un compte IMAP/SMTP pour qu&apos;il soit exposé aux clients MCP.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/accounts/${a.id}`}
              className="card"
              style={{ color: "inherit", textDecoration: "none", display: "block" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong>{a.label}</strong>
                    {a.isDefault && <span className="badge">par défaut</span>}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {a.email} · {a.imapHost}
                  </div>
                </div>
                <span className="muted">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
