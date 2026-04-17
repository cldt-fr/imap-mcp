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
          <h2 style={{ marginBottom: 4 }}>My email accounts</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Accounts configured here are exposed to Claude through MCP.
          </p>
        </div>
        <Link href="/accounts/new" className="btn btn-primary">
          + Add account
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <h3 style={{ marginBottom: 6 }}>No account configured yet</h3>
          <p className="muted" style={{ marginBottom: 20 }}>
            Add your first IMAP/SMTP account to start using it from Claude.
          </p>
          <Link href="/accounts/new" className="btn btn-primary">
            + Add account
          </Link>
        </div>
      ) : (
        <>
          <AccountsList accounts={accounts} />
          <div className="card">
            <div className="row row-between">
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  Connect this server to Claude
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
        </>
      )}
    </div>
  );
}
