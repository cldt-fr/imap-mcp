import { NextResponse } from "next/server";
import { verifyAttachmentToken } from "@/lib/auth/attachmentToken";
import { getAttachment } from "@/lib/imap";
import { loadAccount } from "@/lib/mcp/context";

export const dynamic = "force-dynamic";

function sanitizeFilename(name: string | null, fallback: string): string {
  const safe = (name ?? fallback).replace(/[\r\n"]/g, "").trim();
  return safe || fallback;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const payload = verifyAttachmentToken(token);
  if (!payload) {
    return new NextResponse("invalid or expired token", { status: 403 });
  }

  const account = await loadAccount(payload.userId, payload.accountId);
  if (!account) {
    return new NextResponse("account not found", { status: 404 });
  }

  let attachment;
  try {
    attachment = await getAttachment(
      account,
      payload.folder,
      payload.uid,
      payload.index,
    );
  } catch (e) {
    return new NextResponse(
      `imap error: ${e instanceof Error ? e.message : "unknown"}`,
      { status: 502 },
    );
  }

  if (!attachment) {
    return new NextResponse("attachment not found", { status: 404 });
  }

  const filename = sanitizeFilename(
    attachment.filename,
    `attachment-${payload.uid}-${payload.index}`,
  );
  const body = Buffer.from(attachment.base64, "base64");
  // RFC 5987 filename* encoding handles non-ASCII names (é, etc.) cleanly.
  const utf8 = encodeURIComponent(filename);
  const contentDisposition = `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${utf8}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
