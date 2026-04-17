import { NextResponse } from "next/server";
import {
  consumeAuthCode,
  issueTokenPair,
  loadClient,
  rotateRefresh,
  sha256,
  verifyPkce,
} from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

function unauthorized(description: string, status = 401) {
  return NextResponse.json(
    { error: "invalid_client", error_description: description },
    { status },
  );
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const p = new URLSearchParams(text);
    return Object.fromEntries(p.entries());
  }
  if (ct.includes("application/json")) {
    const body = (await req.json()) as Record<string, string>;
    return body;
  }
  const p = new URLSearchParams(await req.text());
  return Object.fromEntries(p.entries());
}

function parseBasicAuth(req: Request): { clientId: string; clientSecret: string } | null {
  const h = req.headers.get("authorization");
  if (!h || !h.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { clientId: decoded.slice(0, idx), clientSecret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

async function authenticateClient(
  req: Request,
  body: Record<string, string>,
): Promise<{ clientId: string; ok: boolean; reason?: string }> {
  const basic = parseBasicAuth(req);
  const clientId = basic?.clientId ?? body.client_id;
  if (!clientId) return { clientId: "", ok: false, reason: "missing client_id" };
  const client = await loadClient(clientId);
  if (!client) return { clientId, ok: false, reason: "unknown client" };
  if (client.tokenEndpointAuthMethod === "none") return { clientId, ok: true };
  const provided = basic?.clientSecret ?? body.client_secret;
  if (!provided) return { clientId, ok: false, reason: "missing client_secret" };
  if (!client.clientSecretHash) return { clientId, ok: false, reason: "client has no secret" };
  if (sha256(provided) !== client.clientSecretHash) return { clientId, ok: false, reason: "bad secret" };
  return { clientId, ok: true };
}

export async function POST(req: Request) {
  const body = await readForm(req);
  const grantType = body.grant_type;

  const auth = await authenticateClient(req, body);
  if (!auth.ok) return unauthorized(auth.reason ?? "invalid_client");
  const clientId = auth.clientId;

  if (grantType === "authorization_code") {
    const code = body.code;
    const verifier = body.code_verifier;
    const redirectUri = body.redirect_uri;
    if (!code || !verifier || !redirectUri) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const consumed = await consumeAuthCode(code);
    if (!consumed) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (consumed.clientId !== clientId || consumed.redirectUri !== redirectUri) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (!verifyPkce(verifier, consumed.codeChallenge, consumed.codeChallengeMethod)) {
      return NextResponse.json({ error: "invalid_grant", error_description: "bad pkce" }, { status: 400 });
    }
    const pair = await issueTokenPair({
      clientId,
      userId: consumed.userId,
      scope: consumed.scope,
    });
    return NextResponse.json(pair);
  }

  if (grantType === "refresh_token") {
    const refresh = body.refresh_token;
    if (!refresh) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const old = await rotateRefresh(refresh);
    if (!old || old.clientId !== clientId) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    const pair = await issueTokenPair({
      clientId,
      userId: old.userId,
      scope: old.scope,
    });
    return NextResponse.json(pair);
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
