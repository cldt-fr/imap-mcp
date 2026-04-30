import Link from "next/link";
import { CalendarAccountForm } from "@/components/CalendarAccountForm";

export default function NewCalendarAccountPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/calendars" className="muted">
          ← Back
        </Link>
      </div>
      <h2 style={{ marginBottom: 24 }}>New calendar account</h2>
      <CalendarAccountForm mode="create" />
    </div>
  );
}
