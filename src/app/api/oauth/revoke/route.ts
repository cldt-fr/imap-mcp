import { NextResponse } from "next/server";
import { revokeByAccessToken, revokeByRefreshToken } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await req.text()).entries());
  }
  if (ct.includes("application/json")) return (await req.json()) as Record<string, string>;
  return Object.fromEntries(new URLSearchParams(await req.text()).entries());
}

export async function POST(req: Request) {
  const body = await readForm(req);
  const token = body.token;
  const hint = body.token_type_hint;
  if (!token) return NextResponse.json({}, { status: 200 });
  if (hint === "refresh_token") {
    await revokeByRefreshToken(token);
  } else {
    await revokeByAccessToken(token);
    await revokeByRefreshToken(token);
  }
  return NextResponse.json({}, { status: 200 });
}
