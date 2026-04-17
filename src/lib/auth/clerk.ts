import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function requireClerkUserId(): Promise<string> {
  const userId = await getClerkUserId();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export async function ensureUserRow(clerkUserId: string): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(users)
    .values({ clerkUserId })
    .returning({ id: users.id });
  return created.id;
}

export async function getCurrentUserRowId(): Promise<string> {
  const clerkUserId = await requireClerkUserId();
  return ensureUserRow(clerkUserId);
}
