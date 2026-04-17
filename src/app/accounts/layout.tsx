import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="header">
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
          <h1 style={{ fontSize: 20 }}>IMAP MCP</h1>
        </Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/accounts" className="muted">
            Mes comptes
          </Link>
          <UserButton />
        </div>
      </div>
      {children}
    </div>
  );
}
