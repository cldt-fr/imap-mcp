import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  oauthAuthCodes,
  oauthClients,
  oauthTokens,
  type OAuthToken,
} from "@/lib/db/schema";

const AUTH_CODE_TTL_SECONDS = 10 * 60;

function accessTokenTtl(): number {
  return Number(process.env.OAUTH_ACCESS_TOKEN_TTL ?? 3600);
}
function refreshTokenTtl(): number {
  return Number(process.env.OAUTH_REFRESH_TOKEN_TTL ?? 60 * 60 * 24 * 30);
}

export function appBaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_APP_URL;
  if (!v) throw new Error("NEXT_PUBLIC_APP_URL is required");
  return v.replace(/\/$/, "");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method === "plain") return verifier === challenge;
  if (method !== "S256") return false;
  const digest = createHash("sha256").update(verifier).digest();
  return digest.toString("base64url") === challenge;
}

export async function registerClient(input: {
  redirectUris: string[];
  name?: string;
  tokenEndpointAuthMethod?: string;
}): Promise<{ client_id: string; client_secret?: string }> {
  const clientId = `mcp_${randomToken(12)}`;
  const authMethod = input.tokenEndpointAuthMethod ?? "none";
  let clientSecret: string | undefined;
  let clientSecretHash: string | null = null;
  if (authMethod !== "none") {
    clientSecret = randomToken(32);
    clientSecretHash = sha256(clientSecret);
  }
  await db.insert(oauthClients).values({
    id: clientId,
    clientSecretHash,
    redirectUris: input.redirectUris,
    name: input.name ?? null,
    tokenEndpointAuthMethod: authMethod,
  });
  return { client_id: clientId, client_secret: clientSecret };
}

export async function loadClient(clientId: string) {
  const [row] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
    .limit(1);
  return row ?? null;
}

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
}): Promise<string> {
  const code = randomToken(32);
  await db.insert(oauthAuthCodes).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export async function consumeAuthCode(
  code: string,
): Promise<{
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
} | null> {
  const [row] = await db
    .select()
    .from(oauthAuthCodes)
    .where(
      and(
        eq(oauthAuthCodes.code, code),
        isNull(oauthAuthCodes.consumedAt),
        gt(oauthAuthCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(oauthAuthCodes)
    .set({ consumedAt: new Date() })
    .where(eq(oauthAuthCodes.code, code));
  return {
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    scope: row.scope,
  };
}

export async function issueTokenPair(input: {
  clientId: string;
  userId: string;
  scope: string | null;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string | null;
}> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  const accessTtl = accessTokenTtl();
  const refreshTtl = refreshTokenTtl();
  await db.insert(oauthTokens).values({
    accessTokenHash: sha256(access),
    refreshTokenHash: sha256(refresh),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    accessExpiresAt: new Date(Date.now() + accessTtl * 1000),
    refreshExpiresAt: new Date(Date.now() + refreshTtl * 1000),
  });
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: accessTtl,
    token_type: "Bearer",
    scope: input.scope,
  };
}

export async function resolveAccessToken(access: string): Promise<OAuthToken | null> {
  const hash = sha256(access);
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.accessTokenHash, hash),
        gt(oauthTokens.accessExpiresAt, new Date()),
        isNull(oauthTokens.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function rotateRefresh(refresh: string): Promise<OAuthToken | null> {
  const hash = sha256(refresh);
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.refreshTokenHash, hash),
        isNull(oauthTokens.revokedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < Date.now()) return null;
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.id, row.id));
  return row;
}

export async function revokeByAccessToken(access: string): Promise<void> {
  const hash = sha256(access);
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.accessTokenHash, hash));
}

export async function revokeByRefreshToken(refresh: string): Promise<void> {
  const hash = sha256(refresh);
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.refreshTokenHash, hash));
}
