import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { encrypt } from "@/lib/crypto";
import { sanitizeSignatureHtml } from "@/lib/smtp";
import { accountUpdateSchema } from "@/lib/validation/account";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const [row] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { imapPasswordEnc, smtpPasswordEnc, ...safe } = row;
  void imapPasswordEnc;
  void smtpPasswordEnc;
  return NextResponse.json({ account: safe });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const body = await req.json();
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;

  const [existing] = await db
    .select({ id: mailAccounts.id })
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (input.isDefault) {
    await db
      .update(mailAccounts)
      .set({ isDefault: false })
      .where(eq(mailAccounts.userId, userId));
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.email !== undefined) patch.email = input.email;
  if (input.imapHost !== undefined) patch.imapHost = input.imapHost;
  if (input.imapPort !== undefined) patch.imapPort = input.imapPort;
  if (input.imapSecure !== undefined) patch.imapSecure = input.imapSecure;
  if (input.imapUser !== undefined) patch.imapUser = input.imapUser;
  if (input.imapPassword) patch.imapPasswordEnc = encrypt(input.imapPassword);
  if (input.smtpHost !== undefined) patch.smtpHost = input.smtpHost;
  if (input.smtpPort !== undefined) patch.smtpPort = input.smtpPort;
  if (input.smtpSecure !== undefined) patch.smtpSecure = input.smtpSecure;
  if (input.smtpUser !== undefined) patch.smtpUser = input.smtpUser;
  if (input.smtpPassword) patch.smtpPasswordEnc = encrypt(input.smtpPassword);
  if (input.signatureHtml !== undefined) {
    patch.signatureHtml = input.signatureHtml ? sanitizeSignatureHtml(input.signatureHtml) : null;
  }
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;

  await db
    .update(mailAccounts)
    .set(patch)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const res = await db
    .delete(mailAccounts)
    .where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, userId)))
    .returning({ id: mailAccounts.id });
  if (res.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
