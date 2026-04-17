import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { testImapConnection } from "@/lib/imap";
import { testSmtpConnection } from "@/lib/smtp";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const [acc] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)))
    .limit(1);
  if (!acc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = { imap: { ok: false, error: null as string | null }, smtp: { ok: false, error: null as string | null } };
  try {
    await testImapConnection(acc);
    result.imap.ok = true;
  } catch (e) {
    result.imap.error = e instanceof Error ? e.message : String(e);
  }
  try {
    await testSmtpConnection(acc);
    result.smtp.ok = true;
  } catch (e) {
    result.smtp.error = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(result);
}
