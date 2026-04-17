import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

export interface AttachmentTokenPayload {
  userId: string;
  accountId: string;
  folder: string;
  uid: number;
  index: number;
  exp: number; // unix seconds
}

function keyMaterial(): Buffer {
  // Derive a dedicated HMAC key from MCP_MASTER_KEY rather than reusing the
  // AES-GCM key directly — same root secret, different purpose.
  const raw = process.env.MCP_MASTER_KEY;
  if (!raw) throw new Error("MCP_MASTER_KEY is not set");
  const master = Buffer.from(raw, "base64");
  return createHmac("sha256", master).update("attachment-url-v1").digest();
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export function signAttachmentToken(
  payload: Omit<AttachmentTokenPayload, "exp">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const full: AttachmentTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64urlEncode(JSON.stringify(full));
  const sig = createHmac("sha256", keyMaterial()).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifyAttachmentToken(
  token: string,
): AttachmentTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = createHmac("sha256", keyMaterial()).update(body).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: AttachmentTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload.userId !== "string" ||
    typeof payload.accountId !== "string" ||
    typeof payload.folder !== "string" ||
    typeof payload.uid !== "number" ||
    typeof payload.index !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
