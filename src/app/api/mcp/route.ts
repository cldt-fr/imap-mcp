import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { resolveAccessToken, appBaseUrl } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

function wwwAuthenticate(): Record<string, string> {
  const base = appBaseUrl();
  return {
    "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  };
}

function unauthorized(description: string) {
  return NextResponse.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: wwwAuthenticate() },
  );
}

async function authenticate(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, response: unauthorized("missing bearer token") };
  }
  const token = header.slice(7).trim();
  const row = await resolveAccessToken(token);
  if (!row) {
    return { ok: false, response: unauthorized("invalid or expired token") };
  }
  return { ok: true, userId: row.userId };
}

async function handle(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const server = buildMcpServer({ userId: auth.userId });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close().catch(() => {});
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
