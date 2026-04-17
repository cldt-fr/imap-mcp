import { NextResponse } from "next/server";
import { getCurrentUserRowId } from "@/lib/auth/clerk";
import { createAuthCode, loadClient } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "S256";
  const state = url.searchParams.get("state") ?? "";
  const scope = url.searchParams.get("scope");

  if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "missing required params" },
      { status: 400 },
    );
  }
  if (codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "only S256 supported" },
      { status: 400 },
    );
  }
  const client = await loadClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri mismatch" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserRowId();
  const code = await createAuthCode({
    clientId,
    userId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect.toString());
}
