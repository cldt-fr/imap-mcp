import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = appBaseUrl();
  return NextResponse.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}
