import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context";
import { listUserAccounts, requireAccount } from "./context";
import {
  copyMessages,
  createFolder,
  deleteFolder,
  deleteMessages,
  getAttachment,
  getMessage,
  listFolders,
  listMessages,
  moveMessages,
  renameFolder,
  searchMessages,
  setMessageFlags,
} from "@/lib/imap";
import type { OutgoingAttachment } from "@/lib/smtp";
import { sendMail } from "@/lib/smtp";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z
    .string()
    .min(1)
    .describe("Base64-encoded file contents. Decodes to at most ~25 MB after overhead."),
  content_type: z
    .string()
    .optional()
    .describe("MIME type. Inferred from the filename extension when omitted."),
  content_id: z
    .string()
    .optional()
    .describe("RFC 2392 Content-ID for inline references in HTML (e.g. <img src=\"cid:logo\">)."),
  is_inline: z
    .boolean()
    .optional()
    .describe("If true, attach with Content-Disposition: inline (use with content_id)."),
});

function toOutgoing(list: z.infer<typeof attachmentSchema>[] | undefined): OutgoingAttachment[] | undefined {
  if (!list?.length) return undefined;
  return list.map((a) => ({
    filename: a.filename,
    contentBase64: a.content_base64,
    contentType: a.content_type,
    contentId: a.content_id,
    isInline: a.is_inline,
  }));
}

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
        "Access the current user's registered IMAP email accounts. Call list_accounts first to discover account IDs, then read, search, send, flag, move or delete messages. IMAP folders are identified by their path; messages by their UID.",
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List email accounts",
      description: "List the IMAP/SMTP email accounts configured by the current user.",
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
      description: "List the folders (mailboxes) of an account.",
      inputSchema: {
        account_id: z.string().uuid().describe("Account ID returned by list_accounts"),
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
        "List message headers in a folder (default: the 50 most recent).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string().default("INBOX"),
        limit: z.number().int().min(1).max(200).optional(),
        since: z.string().optional().describe("ISO date — only messages after this date"),
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
        "Fetch a full message (headers, text, HTML, attachment metadata).",
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
        "IMAP search (from, to, subject, body, date ranges, unread only).",
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
      description: "Send an email through the account's SMTP. The HTML signature is appended when include_signature=true. File attachments are accepted as base64.",
      inputSchema: {
        account_id: z.string().uuid(),
        to: z.array(z.string().email()).min(1),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string(),
        body_text: z.string().optional(),
        body_html: z.string().optional(),
        include_signature: z.boolean().default(true),
        attachments: z.array(attachmentSchema).optional(),
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
          attachments: toOutgoing(args.attachments),
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
        "Reply to an existing message (preserves In-Reply-To and References, quotes the original when quote_original=true).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
        body_text: z.string().optional(),
        body_html: z.string().optional(),
        include_signature: z.boolean().default(true),
        quote_original: z.boolean().default(true),
        reply_all: z.boolean().default(false),
        attachments: z.array(attachmentSchema).optional(),
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
          const quoteHeader = `\n\nOn ${original.date ?? ""}, ${original.from ?? ""} wrote:\n`;
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
          attachments: toOutgoing(args.attachments),
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "get_attachment",
    {
      title: "Download an attachment",
      description:
        "Download the binary content of an attachment from a message. Call get_message first to discover attachment indexes. Images are returned as image content (Claude can display them); everything else is returned as an embedded resource with the base64 blob.",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
        attachment_index: z
          .number()
          .int()
          .min(0)
          .describe("Zero-based index from get_message's attachments array"),
        max_size_mb: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe("Hard cap to protect the MCP channel from huge payloads"),
      },
    },
    async ({ account_id, folder, uid, attachment_index, max_size_mb }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const att = await getAttachment(acc, folder, uid, attachment_index);
        if (!att) return errorResult(new Error("attachment not found"));

        const maxBytes = max_size_mb * 1024 * 1024;
        if (att.size > maxBytes) {
          return errorResult(
            new Error(
              `attachment is ${Math.round(att.size / 1024 / 1024)} MB, over the ${max_size_mb} MB limit — raise max_size_mb to fetch it`,
            ),
          );
        }

        const summary = {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId,
          isInline: att.isInline,
        };

        const uri = `mail-attachment://${account_id}/${encodeURIComponent(folder)}/${uid}/${attachment_index}`;

        const isImage = att.contentType.toLowerCase().startsWith("image/");
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
          | {
              type: "resource";
              resource: {
                uri: string;
                mimeType: string;
                blob: string;
              };
            }
        > = [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ];

        if (isImage) {
          content.push({
            type: "image",
            data: att.base64,
            mimeType: att.contentType,
          });
        } else {
          content.push({
            type: "resource",
            resource: {
              uri,
              mimeType: att.contentType,
              blob: att.base64,
            },
          });
        }

        return { content };
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "mark_read",
    {
      title: "Mark as read",
      description: "Mark one or more messages as read (adds the \\Seen flag).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await setMessageFlags(acc, folder, uids, { add: ["\\Seen"] });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "mark_unread",
    {
      title: "Mark as unread",
      description: "Mark one or more messages as unread (removes the \\Seen flag).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await setMessageFlags(acc, folder, uids, { remove: ["\\Seen"] });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "flag_messages",
    {
      title: "Flag messages (star)",
      description:
        "Star / flag one or more messages by adding the \\Flagged marker (equivalent to Gmail's star).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await setMessageFlags(acc, folder, uids, { add: ["\\Flagged"] });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "unflag_messages",
    {
      title: "Remove flag (unstar)",
      description: "Remove the \\Flagged marker (unstar).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await setMessageFlags(acc, folder, uids, { remove: ["\\Flagged"] });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "set_flags",
    {
      title: "Add/remove arbitrary IMAP flags",
      description:
        "Advanced: add and/or remove arbitrary IMAP flags (\\Seen, \\Flagged, \\Answered, $Important, custom labels, …).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
      },
    },
    async ({ account_id, folder, uids, add, remove }) => {
      try {
        if (!add?.length && !remove?.length) {
          return errorResult(new Error("at least one of add/remove must be non-empty"));
        }
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await setMessageFlags(acc, folder, uids, { add, remove });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "move_messages",
    {
      title: "Move messages",
      description: "Move messages from one folder to another (destination assigns new UIDs).",
      inputSchema: {
        account_id: z.string().uuid(),
        from_folder: z.string(),
        to_folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, from_folder, to_folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await moveMessages(acc, from_folder, uids, to_folder);
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "copy_messages",
    {
      title: "Copy messages",
      description: "Copy messages to another folder without removing them from the source.",
      inputSchema: {
        account_id: z.string().uuid(),
        from_folder: z.string(),
        to_folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
      },
    },
    async ({ account_id, from_folder, to_folder, uids }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await copyMessages(acc, from_folder, uids, to_folder);
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "delete_messages",
    {
      title: "Delete messages",
      description:
        "Delete messages. Defaults to moving them to the Trash folder; set permanent=true for an immediate and irreversible expunge.",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uids: z.array(z.number().int().positive()).min(1),
        permanent: z
          .boolean()
          .default(false)
          .describe("If true, expunge instead of moving to Trash."),
      },
    },
    async ({ account_id, folder, uids, permanent }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await deleteMessages(acc, folder, uids, { permanent });
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "create_folder",
    {
      title: "Create folder",
      description:
        "Create a new IMAP folder. Paths may be hierarchical (e.g. 'Archives/2026').",
      inputSchema: {
        account_id: z.string().uuid(),
        path: z.string().min(1),
      },
    },
    async ({ account_id, path }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await createFolder(acc, path);
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "rename_folder",
    {
      title: "Rename folder",
      description: "Rename or reparent a folder.",
      inputSchema: {
        account_id: z.string().uuid(),
        from_path: z.string().min(1),
        to_path: z.string().min(1),
      },
    },
    async ({ account_id, from_path, to_path }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await renameFolder(acc, from_path, to_path);
        return jsonResult(res);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "delete_folder",
    {
      title: "Delete folder",
      description:
        "Delete an IMAP folder (warning: usually irreversible on the server). INBOX is rejected.",
      inputSchema: {
        account_id: z.string().uuid(),
        path: z.string().min(1),
      },
    },
    async ({ account_id, path }) => {
      try {
        if (path.toUpperCase() === "INBOX") {
          return errorResult(new Error("cannot delete INBOX"));
        }
        const acc = await requireAccount(ctx.userId, account_id);
        const res = await deleteFolder(acc, path);
        return jsonResult(res);
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
