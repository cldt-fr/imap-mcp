import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { calendarAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { CalendarAccountForm } from "@/components/CalendarAccountForm";

export const dynamic = "force-dynamic";

export default async function EditCalendarAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getCurrentUserRowId();
  const [acc] = await db
    .select()
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.id, id), eq(calendarAccounts.userId, userId)))
    .limit(1);
  if (!acc) notFound();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/calendars" className="muted">
          ← Back
        </Link>
      </div>
      <h2 style={{ marginBottom: 24 }}>Calendar &quot;{acc.label}&quot;</h2>
      <CalendarAccountForm
        mode="edit"
        accountId={acc.id}
        initial={{
          label: acc.label,
          caldavUrl: acc.caldavUrl,
          username: acc.username,
          password: "",
          defaultCalendarUrl: acc.defaultCalendarUrl ?? "",
          color: acc.color ?? "",
          isDefault: acc.isDefault,
        }}
      />
    </div>
  );
}
