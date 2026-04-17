import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailAccounts, type MailAccount } from "@/lib/db/schema";

export interface McpContext {
  userId: string;
}

export async function listUserAccounts(userId: string) {
  return db
    .select({
      id: mailAccounts.id,
      label: mailAccounts.label,
      email: mailAccounts.email,
      isDefault: mailAccounts.isDefault,
    })
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(mailAccounts.createdAt);
}

export async function loadAccount(
  userId: string,
  accountId: string,
): Promise<MailAccount | null> {
  const [row] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, accountId), eq(mailAccounts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function requireAccount(userId: string, accountId: string): Promise<MailAccount> {
  const acc = await loadAccount(userId, accountId);
  if (!acc) throw new Error(`Account ${accountId} not found for current user`);
  return acc;
}
