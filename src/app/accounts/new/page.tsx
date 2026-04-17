import Link from "next/link";
import { AccountForm } from "@/components/AccountForm";

export default function NewAccountPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/accounts" className="muted">
          ← Retour
        </Link>
      </div>
      <h2 style={{ marginBottom: 24 }}>Nouveau compte email</h2>
      <AccountForm mode="create" />
    </div>
  );
}
