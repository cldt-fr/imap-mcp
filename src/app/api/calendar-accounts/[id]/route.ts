import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { encrypt } from "@/lib/crypto";
import { calendarAccountUpdateSchema } from "@/lib/validation/calendarAccount";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const [row] = await db
    .select()
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { passwordEnc, ...safe } = row;
  void passwordEnc;
  return NextResponse.json({ calendar_account: safe });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const body = await req.json();
  const parsed = calendarAccountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;

  const [existing] = await db
    .select({ id: calendarAccounts.id })
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (input.isDefault) {
    await db
      .update(calendarAccounts)
      .set({ isDefault: false })
      .where(eq(calendarAccounts.userId, userId));
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.caldavUrl !== undefined) patch.caldavUrl = input.caldavUrl;
  if (input.username !== undefined) patch.username = input.username;
  if (input.password) patch.passwordEnc = encrypt(input.password);
  if (input.defaultCalendarUrl !== undefined) {
    patch.defaultCalendarUrl = input.defaultCalendarUrl ?? null;
  }
  if (input.color !== undefined) patch.color = input.color ?? null;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;

  await db
    .update(calendarAccounts)
    .set(patch)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const res = await db
    .delete(calendarAccounts)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)))
    .returning({ id: calendarAccounts.id });
  if (res.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
