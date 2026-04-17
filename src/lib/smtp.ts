import nodemailer from "nodemailer";
import DOMPurify from "isomorphic-dompurify";
import { decrypt } from "@/lib/crypto";
import type { MailAccount } from "@/lib/db/schema";

export type SmtpAccountLike = Pick<
  MailAccount,
  "smtpHost" | "smtpPort" | "smtpSecure" | "smtpUser" | "smtpPasswordEnc" | "email" | "fromName" | "signatureHtml"
>;

function buildFromAddress(acc: SmtpAccountLike): string | { name: string; address: string } {
  const name = acc.fromName?.trim();
  if (!name) return acc.email;
  return { name, address: acc.email };
}

function buildTransport(acc: SmtpAccountLike) {
  return nodemailer.createTransport({
    host: acc.smtpHost,
    port: acc.smtpPort,
    secure: acc.smtpSecure,
    auth: {
      user: acc.smtpUser,
      pass: decrypt(acc.smtpPasswordEnc),
    },
  });
}

export async function testSmtpConnection(acc: SmtpAccountLike): Promise<void> {
  const transport = buildTransport(acc);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export interface OutgoingAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
  contentId?: string;
  isInline?: boolean;
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  includeSignature?: boolean;
  attachments?: OutgoingAttachment[];
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

function safeSignature(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "target", "rel", "width", "height"],
  });
}

function appendSignature(
  acc: SmtpAccountLike,
  input: SendMailInput,
): { text?: string; html?: string } {
  const sig = acc.signatureHtml;
  if (!input.includeSignature || !sig) {
    return { text: input.text, html: input.html };
  }
  const safeSig = safeSignature(sig);
  let html = input.html;
  if (html) {
    html = `${html}<br/><br/>${safeSig}`;
  } else if (input.text) {
    html = `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(input.text)}</pre><br/><br/>${safeSig}`;
  } else {
    html = safeSig;
  }
  return { text: input.text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMail(
  acc: SmtpAccountLike,
  input: SendMailInput,
): Promise<SendMailResult> {
  const transport = buildTransport(acc);
  try {
    const { text, html } = appendSignature(acc, input);
    const info = await transport.sendMail({
      from: buildFromAddress(acc),
      to: input.to.join(", "),
      cc: input.cc?.join(", "),
      bcc: input.bcc?.join(", "),
      subject: input.subject,
      text,
      html,
      inReplyTo: input.inReplyTo,
      references: input.references?.join(" "),
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType,
        cid: a.contentId,
        contentDisposition: a.isInline ? "inline" : "attachment",
      })),
    });
    return {
      messageId: info.messageId,
      accepted: (info.accepted as string[]) ?? [],
      rejected: (info.rejected as string[]) ?? [],
    };
  } finally {
    transport.close();
  }
}

export function sanitizeSignatureHtml(html: string): string {
  return safeSignature(html);
}
