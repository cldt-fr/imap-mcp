import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import DOMPurify from "isomorphic-dompurify";
import { decrypt } from "@/lib/crypto";
import type { MailAccount } from "@/lib/db/schema";
import { saveToSentFolder, type AccountLike } from "@/lib/imap";

export type SmtpAccountLike = Pick<
  MailAccount,
  | "smtpHost"
  | "smtpPort"
  | "smtpSecure"
  | "smtpUser"
  | "smtpPasswordEnc"
  | "email"
  | "fromName"
  | "signatureHtml"
> &
  AccountLike;

/**
 * Providers whose SMTP transparently writes the message to the user's Sent
 * folder — appending via IMAP on top would create duplicates. Every other
 * provider (Outlook, iCloud, Fastmail, OVH, self-hosted…) requires the
 * IMAP APPEND to make the sent message visible in the Sent folder.
 */
function smtpAutoSavesToSent(host: string): boolean {
  const h = host.toLowerCase();
  return h === "smtp.gmail.com" || h.endsWith(".gmail.com");
}

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
  /**
   * Override the automatic Sent-folder detection. true → always APPEND,
   * false → never APPEND. When omitted, we APPEND for every provider except
   * Gmail (which saves to Sent through its SMTP on its own).
   */
  saveToSent?: boolean;
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  savedToSent: {
    attempted: boolean;
    ok: boolean;
    folder?: string | null;
    error?: string;
    skippedReason?: string;
  };
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

function buildRawMime(
  mailOptions: Parameters<typeof nodemailer.createTransport>[0] extends never
    ? never
    : Parameters<nodemailer.Transporter["sendMail"]>[0],
): Promise<{ raw: Buffer; envelope: nodemailer.SendMailOptions["envelope"]; messageId: string }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const composer = new MailComposer(mailOptions as any);
    const node = composer.compile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envelope = (node as any).getEnvelope();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageId: string = (node as any).messageId();
    node.build((err: Error | null, buf: Buffer) => {
      if (err) reject(err);
      else resolve({ raw: buf, envelope, messageId });
    });
  });
}

export async function sendMail(
  acc: SmtpAccountLike,
  input: SendMailInput,
): Promise<SendMailResult> {
  const transport = buildTransport(acc);
  try {
    const { text, html } = appendSignature(acc, input);
    const mailOptions: nodemailer.SendMailOptions = {
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
    };

    // Compose the raw MIME once so we can both feed it to SMTP and APPEND
    // the exact same bytes to IMAP — guarantees the Sent copy matches what
    // the recipient got on the wire (same Message-ID, same Date, same
    // multipart boundaries).
    const { raw, envelope, messageId } = await buildRawMime(mailOptions);

    const info = await transport.sendMail({ envelope, raw, messageId });

    const shouldAppend =
      input.saveToSent === true
        ? true
        : input.saveToSent === false
          ? false
          : !smtpAutoSavesToSent(acc.smtpHost);

    let savedToSent: SendMailResult["savedToSent"] = {
      attempted: false,
      ok: false,
    };
    if (shouldAppend) {
      const r = await saveToSentFolder(acc, raw);
      savedToSent = {
        attempted: true,
        ok: r.ok,
        folder: r.folder,
        error: r.error,
      };
    } else if (smtpAutoSavesToSent(acc.smtpHost)) {
      savedToSent = {
        attempted: false,
        ok: true,
        skippedReason: "provider auto-saves to Sent via SMTP (Gmail)",
      };
    } else {
      savedToSent = {
        attempted: false,
        ok: false,
        skippedReason: "saveToSent=false",
      };
    }

    return {
      messageId: info.messageId ?? messageId,
      accepted: (info.accepted as string[]) ?? [],
      rejected: (info.rejected as string[]) ?? [],
      savedToSent,
    };
  } finally {
    transport.close();
  }
}

export function sanitizeSignatureHtml(html: string): string {
  return safeSignature(html);
}
