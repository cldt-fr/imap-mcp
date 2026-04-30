import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function CalendarsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <nav className="topnav">
        <Link href="/" className="topnav-brand">
          <span className="topnav-logo">@</span>
          <span>IMAP MCP</span>
        </Link>
        <div className="topnav-links">
          <Link href="/accounts" className="btn btn-ghost btn-sm">
            My emails
          </Link>
          <Link href="/calendars" className="btn btn-ghost btn-sm">
            My calendars
          </Link>
          <Link href="/connect" className="btn btn-ghost btn-sm">
            Connect to Claude
          </Link>
          <UserButton />
        </div>
      </nav>
      {children}
    </div>
  );
}
