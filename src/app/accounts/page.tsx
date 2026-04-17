import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { AccountsList } from "@/components/AccountsList";

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
    <div className="stack stack-lg">
      <div className="header">
        <div>
          <h2 style={{ marginBottom: 4 }}>Mes comptes email</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Les comptes configurés ici seront exposés à Claude via MCP.
          </p>
        </div>
        <Link href="/accounts/new" className="btn btn-primary">
          + Ajouter un compte
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <h3 style={{ marginBottom: 6 }}>Aucun compte configuré</h3>
          <p className="muted" style={{ marginBottom: 20 }}>
            Ajoute ton premier compte IMAP/SMTP pour commencer à l&apos;utiliser depuis Claude.
          </p>
          <Link href="/accounts/new" className="btn btn-primary">
            + Ajouter un compte
          </Link>
        </div>
      ) : (
        <>
          <AccountsList accounts={accounts} />
          <div className="card">
            <div className="row row-between">
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Connecter ce serveur à Claude
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
        </>
      )}
    </div>
  );
}
