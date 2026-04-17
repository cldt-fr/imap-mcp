import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mailAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { AccountForm } from "@/components/AccountForm";

export const dynamic = "force-dynamic";

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getCurrentUserRowId();
  const [acc] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)))
    .limit(1);
  if (!acc) notFound();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/accounts" className="muted">
          ← Back
        </Link>
      </div>
      <h2 style={{ marginBottom: 24 }}>Account &quot;{acc.label}&quot;</h2>
      <AccountForm
        mode="edit"
        accountId={acc.id}
        initial={{
          label: acc.label,
          email: acc.email,
          imapHost: acc.imapHost,
          imapPort: acc.imapPort,
          imapSecure: acc.imapSecure,
          imapUser: acc.imapUser,
          imapPassword: "",
          smtpHost: acc.smtpHost,
          smtpPort: acc.smtpPort,
          smtpSecure: acc.smtpSecure,
          smtpUser: acc.smtpUser,
          smtpPassword: "",
          signatureHtml: acc.signatureHtml ?? "",
          isDefault: acc.isDefault,
        }}
      />
    </div>
  );
}
