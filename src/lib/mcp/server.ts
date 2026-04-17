import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context";
import { listUserAccounts, requireAccount } from "./context";
import {
  getMessage,
  listFolders,
  listMessages,
  searchMessages,
} from "@/lib/imap";
import { sendMail } from "@/lib/smtp";

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: msg }],
  };
}

function parseDate(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "imap-mcp", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Access the current user's registered IMAP email accounts. Use list_accounts first to discover account IDs, then read, search or send emails.",
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List email accounts",
      description: "Liste les comptes email IMAP/SMTP configurés par l'utilisateur courant.",
      inputSchema: {},
    },
    async () => {
      try {
        const rows = await listUserAccounts(ctx.userId);
        return jsonResult({ accounts: rows });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "list_folders",
    {
      title: "List IMAP folders",
      description: "Liste les dossiers (mailboxes) d'un compte.",
      inputSchema: {
        account_id: z.string().uuid().describe("ID du compte renvoyé par list_accounts"),
      },
    },
    async ({ account_id }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const folders = await listFolders(acc);
        return jsonResult({ folders });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "list_messages",
    {
      title: "List messages in folder",
      description:
        "Liste les en-têtes des messages d'un dossier (par défaut les 50 plus récents).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string().default("INBOX"),
        limit: z.number().int().min(1).max(200).optional(),
        since: z.string().optional().describe("ISO date — uniquement après cette date"),
        unread_only: z.boolean().optional(),
      },
    },
    async ({ account_id, folder, limit, since, unread_only }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const messages = await listMessages(acc, {
          folder,
          limit,
          since: parseDate(since),
          unreadOnly: unread_only,
        });
        return jsonResult({ messages });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      title: "Get full message",
      description:
        "Récupère un message complet (en-têtes, texte, HTML, liste des pièces jointes).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
      },
    },
    async ({ account_id, folder, uid }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const msg = await getMessage(acc, folder, uid);
        if (!msg) return errorResult(new Error("message not found"));
        return jsonResult({ message: msg });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "search_messages",
    {
      title: "Search messages",
      description:
        "Recherche IMAP (from, to, subject, body, plages de dates, non-lus).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string().default("INBOX"),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        unread_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      try {
        const acc = await requireAccount(ctx.userId, args.account_id);
        const messages = await searchMessages(acc, {
          folder: args.folder,
          from: args.from,
          to: args.to,
          subject: args.subject,
          body: args.body,
          dateFrom: parseDate(args.date_from),
          dateTo: parseDate(args.date_to),
          unreadOnly: args.unread_only,
          limit: args.limit,
        });
        return jsonResult({ messages });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "send_message",
    {
      title: "Send email",
      description: "Envoie un email via le SMTP du compte. La signature HTML est ajoutée si include_signature=true.",
      inputSchema: {
        account_id: z.string().uuid(),
        to: z.array(z.string().email()).min(1),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string(),
        body_text: z.string().optional(),
        body_html: z.string().optional(),
        include_signature: z.boolean().default(true),
      },
    },
    async (args) => {
      try {
        if (!args.body_text && !args.body_html) {
          return errorResult(new Error("body_text or body_html required"));
        }
        const acc = await requireAccount(ctx.userId, args.account_id);
        const result = await sendMail(acc, {
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject,
          text: args.body_text,
          html: args.body_html,
          includeSignature: args.include_signature,
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "reply_message",
    {
      title: "Reply to message",
      description:
        "Répond à un message existant (conserve In-Reply-To et References, cite l'original si quote_original=true).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
        body_text: z.string().optional(),
        body_html: z.string().optional(),
        include_signature: z.boolean().default(true),
        quote_original: z.boolean().default(true),
        reply_all: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        if (!args.body_text && !args.body_html) {
          return errorResult(new Error("body_text or body_html required"));
        }
        const acc = await requireAccount(ctx.userId, args.account_id);
        const original = await getMessage(acc, args.folder, args.uid);
        if (!original) return errorResult(new Error("original message not found"));

        const to = original.from
          ? [extractAddress(original.from)]
          : [];
        const cc = args.reply_all ? original.cc.map(extractAddress).filter(Boolean) : undefined;

        const subject = original.subject
          ? original.subject.toLowerCase().startsWith("re:")
            ? original.subject
            : `Re: ${original.subject}`
          : "Re:";

        const refs = [...original.references];
        if (original.messageId) refs.push(original.messageId);

        let bodyText = args.body_text;
        let bodyHtml = args.body_html;
        if (args.quote_original) {
          const quoteHeader = `\n\nLe ${original.date ?? ""}, ${original.from ?? ""} a écrit :\n`;
          if (bodyText && original.text) {
            const quoted = original.text
              .split("\n")
              .map((l) => `> ${l}`)
              .join("\n");
            bodyText = `${bodyText}${quoteHeader}${quoted}`;
          }
          if (bodyHtml && original.html) {
            bodyHtml = `${bodyHtml}<blockquote style="border-left:2px solid #ccc;padding-left:8px;margin-left:0">${original.html}</blockquote>`;
          }
        }

        const result = await sendMail(acc, {
          to: to.filter(Boolean) as string[],
          cc,
          subject,
          text: bodyText,
          html: bodyHtml,
          includeSignature: args.include_signature,
          inReplyTo: original.messageId ?? undefined,
          references: refs.filter(Boolean),
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  return server;
}

function extractAddress(field: string): string {
  const m = field.match(/<([^>]+)>/);
  if (m) return m[1];
  return field.trim();
}
