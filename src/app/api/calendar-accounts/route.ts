import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { encrypt } from "@/lib/crypto";
import { calendarAccountCreateSchema } from "@/lib/validation/calendarAccount";

export async function GET() {
  const userId = await getCurrentUserRowId();
  const rows = await db
    .select({
      id: calendarAccounts.id,
      label: calendarAccounts.label,
      caldavUrl: calendarAccounts.caldavUrl,
      username: calendarAccounts.username,
      defaultCalendarUrl: calendarAccounts.defaultCalendarUrl,
      color: calendarAccounts.color,
      isDefault: calendarAccounts.isDefault,
      createdAt: calendarAccounts.createdAt,
    })
    .from(calendarAccounts)
    .where(eq(calendarAccounts.userId, userId))
    .orderBy(calendarAccounts.createdAt);
  return NextResponse.json({ calendar_accounts: rows });
}

export async function POST(req: Request) {
  const userId = await getCurrentUserRowId();
  const body = await req.json();
  const parsed = calendarAccountCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.isDefault) {
    await db
      .update(calendarAccounts)
      .set({ isDefault: false })
      .where(eq(calendarAccounts.userId, userId));
  } else {
    const existingCount = await db
      .select({ id: calendarAccounts.id })
      .from(calendarAccounts)
      .where(eq(calendarAccounts.userId, userId));
    if (existingCount.length === 0) {
      input.isDefault = true;
    }
  }

  const [created] = await db
    .insert(calendarAccounts)
    .values({
      userId,
      label: input.label,
      caldavUrl: input.caldavUrl,
      username: input.username,
      passwordEnc: encrypt(input.password),
      defaultCalendarUrl: input.defaultCalendarUrl ?? null,
      color: input.color ?? null,
      isDefault: input.isDefault ?? false,
    })
    .returning({ id: calendarAccounts.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
