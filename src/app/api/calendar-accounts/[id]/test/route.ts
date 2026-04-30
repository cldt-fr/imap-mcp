import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { testCalDavConnection } from "@/lib/caldav";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserRowId();
  const [acc] = await db
    .select()
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)))
    .limit(1);
  if (!acc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = {
    caldav: {
      ok: false,
      calendarCount: 0,
      error: null as string | null,
    },
  };
  try {
    const r = await testCalDavConnection(acc);
    result.caldav.ok = true;
    result.caldav.calendarCount = r.calendarCount;
  } catch (e) {
    result.caldav.error = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(result);
}
