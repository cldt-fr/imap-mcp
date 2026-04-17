import { ImapFlow, type FetchMessageObject, type ListResponse } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { decrypt } from "@/lib/crypto";
import type { MailAccount } from "@/lib/db/schema";

export type AccountLike = Pick<
  MailAccount,
  "imapHost" | "imapPort" | "imapSecure" | "imapUser" | "imapPasswordEnc"
>;

function buildClient(acc: AccountLike): ImapFlow {
  return new ImapFlow({
    host: acc.imapHost,
    port: acc.imapPort,
    secure: acc.imapSecure,
    auth: {
      user: acc.imapUser,
      pass: decrypt(acc.imapPasswordEnc),
    },
    logger: false,
  });
}

export async function withImap<T>(
  acc: AccountLike,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = buildClient(acc);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function testImapConnection(acc: AccountLike): Promise<void> {
  await withImap(acc, async (client) => {
    await client.noop();
  });
}

export async function listFolders(acc: AccountLike): Promise<
  Array<{ path: string; name: string; specialUse?: string | null; subscribed?: boolean }>
> {
  return withImap(acc, async (client) => {
    const raw: ListResponse[] = await client.list();
    return raw.map((f) => ({
      path: f.path,
      name: f.name,
      specialUse: f.specialUse ?? null,
      subscribed: f.subscribed,
    }));
  });
}

export interface MessageSummary {
  uid: number;
  seq: number;
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  flags: string[];
  preview?: string | null;
}

export interface ListMessagesOptions {
  folder: string;
  limit?: number;
  since?: Date;
  unreadOnly?: boolean;
}

export async function listMessages(
  acc: AccountLike,
  opts: ListMessagesOptions,
): Promise<MessageSummary[]> {
  const { folder, limit = 50, since, unreadOnly } = opts;
  return withImap(acc, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const search: Record<string, unknown> = {};
      if (since) search.since = since;
      if (unreadOnly) search.seen = false;
      const uids = await client.search(search, { uid: true });
      if (!uids || uids.length === 0) return [];
      const tail = uids.slice(-limit).reverse();
      const results: MessageSummary[] = [];
      for await (const msg of client.fetch(
        { uid: tail.join(",") },
        { envelope: true, flags: true, uid: true, internalDate: true },
        { uid: true },
      )) {
        results.push(toSummary(msg));
      }
      return results;
    } finally {
      lock.release();
    }
  });
}

function toSummary(msg: FetchMessageObject): MessageSummary {
  const env = msg.envelope;
  const from = env?.from?.[0];
  const to = env?.to?.[0];
  return {
    uid: msg.uid,
    seq: msg.seq,
    subject: env?.subject ?? null,
    from: from ? `${from.name ?? ""} <${from.address ?? ""}>`.trim() : null,
    to: to ? `${to.name ?? ""} <${to.address ?? ""}>`.trim() : null,
    date: env?.date ? new Date(env.date).toISOString() : null,
    flags: msg.flags ? Array.from(msg.flags) : [],
  };
}

export interface FullMessage {
  uid: number;
  subject: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  date: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: Array<{ filename: string | null; size: number; contentType: string }>;
}

export async function getMessage(
  acc: AccountLike,
  folder: string,
  uid: number,
): Promise<FullMessage | null> {
  return withImap(acc, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const parsed: ParsedMail = await simpleParser(msg.source);
      return {
        uid: msg.uid,
        subject: parsed.subject ?? null,
        from: parsed.from?.text ?? null,
        to: addrList(parsed.to),
        cc: addrList(parsed.cc),
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text ?? null,
        html: typeof parsed.html === "string" ? parsed.html : null,
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        references: Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
            ? [parsed.references]
            : [],
        attachments: (parsed.attachments ?? []).map((a) => ({
          filename: a.filename ?? null,
          size: a.size ?? 0,
          contentType: a.contentType ?? "application/octet-stream",
        })),
      };
    } finally {
      lock.release();
    }
  });
}

function addrList(
  field: ParsedMail["to"] | ParsedMail["cc"] | ParsedMail["from"],
): string[] {
  if (!field) return [];
  const arr = Array.isArray(field) ? field : [field];
  return arr.map((a) => a.text).filter(Boolean);
}

export interface SearchCriteria {
  folder: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  dateFrom?: Date;
  dateTo?: Date;
  unreadOnly?: boolean;
  limit?: number;
}

export async function searchMessages(
  acc: AccountLike,
  crit: SearchCriteria,
): Promise<MessageSummary[]> {
  const { folder, limit = 50 } = crit;
  return withImap(acc, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const query: Record<string, unknown> = {};
      if (crit.from) query.from = crit.from;
      if (crit.to) query.to = crit.to;
      if (crit.subject) query.subject = crit.subject;
      if (crit.body) query.body = crit.body;
      if (crit.dateFrom) query.since = crit.dateFrom;
      if (crit.dateTo) query.before = crit.dateTo;
      if (crit.unreadOnly) query.seen = false;
      const uids = await client.search(query, { uid: true });
      if (!uids || uids.length === 0) return [];
      const tail = uids.slice(-limit).reverse();
      const results: MessageSummary[] = [];
      for await (const msg of client.fetch(
        { uid: tail.join(",") },
        { envelope: true, flags: true, uid: true },
        { uid: true },
      )) {
        results.push(toSummary(msg));
      }
      return results;
    } finally {
      lock.release();
    }
  });
}
