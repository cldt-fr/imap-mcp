import Link from "next/link";
import { AccountForm } from "@/components/AccountForm";

export default function NewAccountPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/accounts" className="muted">
          ← Back
        </Link>
      </div>
      <h2 style={{ marginBottom: 24 }}>New email account</h2>
      <AccountForm mode="create" />
    </div>
  );
}
