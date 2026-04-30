import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarAccounts } from "@/lib/db/schema";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { CalendarAccountsList } from "@/components/CalendarAccountsList";

export const dynamic = "force-dynamic";

export default async function CalendarsPage() {
  const userId = await getCurrentUserRowId();
  const accounts = await db
    .select({
      id: calendarAccounts.id,
      label: calendarAccounts.label,
      caldavUrl: calendarAccounts.caldavUrl,
      username: calendarAccounts.username,
      isDefault: calendarAccounts.isDefault,
    })
    .from(calendarAccounts)
    .where(eq(calendarAccounts.userId, userId))
    .orderBy(calendarAccounts.createdAt);

  return (
    <div className="stack stack-lg">
      <div className="header">
        <div>
          <h2 style={{ marginBottom: 4 }}>My calendar accounts</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            CalDAV accounts configured here are exposed to Claude through MCP.
          </p>
        </div>
        <Link href="/calendars/new" className="btn btn-primary">
          + Add calendar
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗓️</div>
          <h3 style={{ marginBottom: 6 }}>No calendar configured yet</h3>
          <p className="muted" style={{ marginBottom: 20 }}>
            Add your first CalDAV account to let Claude read and manage your calendar.
          </p>
          <Link href="/calendars/new" className="btn btn-primary">
            + Add calendar
          </Link>
        </div>
      ) : (
        <CalendarAccountsList accounts={accounts} />
      )}
    </div>
  );
}
