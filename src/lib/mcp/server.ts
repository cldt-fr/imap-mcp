import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context";
import {
  listUserAccounts,
  listUserCalendarAccounts,
  requireAccount,
  requireCalendarAccount,
} from "./context";
import {
  copyMessages,
  createFolder,
  deleteFolder,
  deleteMessages,
  getAttachment,
  getMessage,
  getThread,
  listFolders,
  listMessages,
  moveMessages,
  renameFolder,
  searchMessages,
  setMessageFlags,
} from "@/lib/imap";
import type { OutgoingAttachment } from "@/lib/smtp";
import { sendMail } from "@/lib/smtp";
import { signAttachmentToken } from "@/lib/auth/attachmentToken";
import { appBaseUrl } from "@/lib/auth/oauth";
import {
  createEvent,
  deleteEvent,
  findFreeSlots,
  getEvent,
  listCalendars,
  listEvents,
  updateEvent,
} from "@/lib/caldav";

function attachmentDownloadUrl(
  userId: string,
  accountId: string,
  folder: string,
  uid: number,
  index: number,
  ttlSeconds = 15 * 60,
): { url: string; expires_at: string } {
  const token = signAttachmentToken(
    { userId, accountId, folder, uid, index },
    ttlSeconds,
  );
  return {
    url: `${appBaseUrl()}/api/attachments/${token}`,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

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
        "This server gives access to the current user's registered IMAP email accounts AND their CalDAV calendar accounts.\n\nEMAIL — Call list_accounts first to discover email account IDs; the response carries each account's `writingStyleInstructions`, a pre-rendered directive you MUST follow verbatim when drafting via send_message or reply_message (it covers language, tone, formality, greeting, sign-off, length, emoji policy and custom user rules). IMAP folders are identified by their path; messages by their UID.\n\nCALENDAR — Call list_calendar_accounts to discover calendar account IDs (independent of email accounts), then list_calendars to find calendar collection URLs. Events use ETag-based optimistic concurrency: keep the `etag` returned by list_events / get_event and pass it to update_event / delete_event — a stale etag returns 412 Precondition Failed and you should re-fetch.\n\nTIMEZONES — Every event response carries `start`/`end` (UTC ISO), `startLocal`/`endLocal` (wall-clock when a TZID is set) and `tz` (IANA name, e.g. \"Europe/Paris\", or null when stored as UTC). When creating/updating events, pass `tz` to anchor the event to a real timezone — recurring events then survive DST correctly. For `start`/`end`, pass either a floating local time like \"2026-05-01T10:00:00\" interpreted in the given `tz`, or a zoned/UTC ISO (\"…Z\" / \"…+02:00\") which will be converted to the tz local time. Omit `tz` to store the event in UTC. Recurring events return their raw RRULE; pass expand_recurring=true on list_events to expand individual occurrences within the requested time range.",
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
        const enriched = {
          ...msg,
          attachments: msg.attachments.map((a) => ({
            ...a,
            ...attachmentDownloadUrl(ctx.userId, account_id, folder, uid, a.index),
          })),
        };
        return jsonResult({ message: enriched });
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
      description:
        "Send an email through the account's SMTP. Before drafting, call list_accounts and follow the chosen account's `writingStyleInstructions` verbatim — it encodes language, tone, greetings, length and any custom rules the user configured. The HTML signature is appended when include_signature=true. File attachments are accepted as base64. A copy of the sent message is IMAP-appended to the Sent folder for every provider except Gmail (which already saves to Sent through SMTP).",
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
        "Reply to an existing message (preserves In-Reply-To and References, quotes the original when quote_original=true). Follow the account's `writingStyleInstructions` from list_accounts when drafting the body. The reply is IMAP-appended to Sent (skipped on Gmail).",
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
    "get_thread",
    {
      title: "Get full conversation thread",
      description:
        "Return every message in the same conversation as the anchor message, sorted oldest → newest. Uses Gmail's X-GM-THRID when available (fast, reliable) and falls back to walking the RFC 5322 References / Message-ID chain for generic IMAP. By default searches only the given folder; pass cross_folder=true to scan every mailbox (useful to pick up Sent replies in non-Gmail accounts — on Gmail the All Mail label already contains everything).",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
        cross_folder: z
          .boolean()
          .default(false)
          .describe("Search all mailboxes on the server instead of just the current folder."),
        max_messages: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Cap on the number of messages returned."),
      },
    },
    async ({ account_id, folder, uid, cross_folder, max_messages }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const thread = await getThread(acc, folder, uid, {
          crossFolder: cross_folder,
          maxMessages: max_messages,
        });
        if (!thread) return errorResult(new Error("anchor message not found"));
        const enriched = {
          strategy: thread.strategy,
          threadId: thread.threadId,
          truncated: thread.truncated,
          count: thread.messages.length,
          messages: thread.messages.map((m) => ({
            ...m,
            attachments: m.attachments.map((a) => ({
              ...a,
              ...attachmentDownloadUrl(
                ctx.userId,
                account_id,
                m.folder,
                m.uid,
                a.index,
              ),
            })),
          })),
        };
        return jsonResult(enriched);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "get_attachment",
    {
      title: "Get an attachment download URL",
      description:
        "Return a short-lived (15 min) signed HTTPS URL that the user can click to download the attachment. Images are additionally embedded as image content so Claude can preview them inline. The file is never stored on the server — it's streamed from IMAP on demand. Call get_message first to discover attachment indexes — the URL is also available there. Use inline_blob=true to also return the raw base64 (capped by max_size_mb) for clients that handle embedded resources natively.",
      inputSchema: {
        account_id: z.string().uuid(),
        folder: z.string(),
        uid: z.number().int().positive(),
        attachment_index: z
          .number()
          .int()
          .min(0)
          .describe("Zero-based index from get_message's attachments array"),
        inline_blob: z
          .boolean()
          .default(false)
          .describe("Also return the raw base64 as an embedded MCP resource (off by default to keep payloads small)."),
        max_size_mb: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe("Cap applied when inline_blob=true."),
      },
    },
    async ({ account_id, folder, uid, attachment_index, inline_blob, max_size_mb }) => {
      try {
        const acc = await requireAccount(ctx.userId, account_id);
        const att = await getAttachment(acc, folder, uid, attachment_index);
        if (!att) return errorResult(new Error("attachment not found"));

        const dl = attachmentDownloadUrl(
          ctx.userId,
          account_id,
          folder,
          uid,
          attachment_index,
        );

        const summary = {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId,
          isInline: att.isInline,
          download_url: dl.url,
          expires_at: dl.expires_at,
        };

        const isImage = att.contentType.toLowerCase().startsWith("image/");
        type Item =
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
          | {
              type: "resource";
              resource: { uri: string; mimeType: string; blob: string };
            };
        const content: Item[] = [
          { type: "text", text: JSON.stringify(summary, null, 2) },
        ];

        if (isImage) {
          content.push({
            type: "image",
            data: att.base64,
            mimeType: att.contentType,
          });
        }

        if (inline_blob && !isImage) {
          const maxBytes = max_size_mb * 1024 * 1024;
          if (att.size > maxBytes) {
            return errorResult(
              new Error(
                `inline_blob requested but attachment is ${Math.round(att.size / 1024 / 1024)} MB, over the ${max_size_mb} MB limit — raise max_size_mb or rely on download_url`,
              ),
            );
          }
          const uri = `mail-attachment://${account_id}/${encodeURIComponent(folder)}/${uid}/${attachment_index}`;
          content.push({
            type: "resource",
            resource: { uri, mimeType: att.contentType, blob: att.base64 },
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

  // ──────────────────────────────────────────────────────────────────────────
  // Calendar (CalDAV) tools
  // ──────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "list_calendar_accounts",
    {
      title: "List calendar accounts",
      description:
        "List the CalDAV calendar accounts configured by the current user. These are independent of email accounts.",
      inputSchema: {},
    },
    async () => {
      try {
        const rows = await listUserCalendarAccounts(ctx.userId);
        return jsonResult({ calendar_accounts: rows });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "list_calendars",
    {
      title: "List calendars",
      description:
        "List the calendar collections available on a CalDAV account. Use the returned `url` as `calendar_url` in subsequent tools.",
      inputSchema: {
        account_id: z
          .string()
          .uuid()
          .describe("Calendar account ID returned by list_calendar_accounts"),
      },
    },
    async ({ account_id }) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, account_id);
        const calendars = await listCalendars(acc);
        return jsonResult({ calendars });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "list_events",
    {
      title: "List calendar events",
      description:
        "List events in a calendar over a time window. Returns each event's `url` and `etag` (needed for update_event / delete_event). Recurring events are returned once (the master) with their raw RRULE; pass expand_recurring=true to also receive an `occurrences[]` array expanded within the requested range.",
      inputSchema: {
        account_id: z.string().uuid(),
        calendar_url: z
          .string()
          .url()
          .describe("Calendar collection URL from list_calendars"),
        time_min: z.string().describe("ISO 8601 datetime — lower bound (inclusive)"),
        time_max: z.string().describe("ISO 8601 datetime — upper bound (exclusive)"),
        expand_recurring: z.boolean().default(false),
      },
    },
    async ({ account_id, calendar_url, time_min, time_max, expand_recurring }) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, account_id);
        const tMin = parseDate(time_min);
        const tMax = parseDate(time_max);
        if (!tMin || !tMax) throw new Error("time_min and time_max are required");
        const result = await listEvents(acc, {
          calendarUrl: calendar_url,
          timeMin: tMin,
          timeMax: tMax,
          expandRecurring: expand_recurring,
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get a single event",
      description:
        "Fetch a single event by its calendar URL + event URL. Returns the parsed event plus the raw iCalendar string.",
      inputSchema: {
        account_id: z.string().uuid(),
        calendar_url: z.string().url(),
        event_url: z.string().url(),
      },
    },
    async ({ account_id, calendar_url, event_url }) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, account_id);
        const r = await getEvent(acc, calendar_url, event_url);
        if (!r) return errorResult(new Error("event not found"));
        return jsonResult(r);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  const attendeeInputSchema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z
      .enum(["REQ-PARTICIPANT", "OPT-PARTICIPANT", "NON-PARTICIPANT", "CHAIR"])
      .optional(),
    rsvp: z.boolean().optional(),
  });

  const reminderInputSchema = z.object({
    minutes_before: z.number().int().min(0).max(40320),
    action: z.enum(["DISPLAY", "EMAIL", "AUDIO"]).optional(),
  });

  server.registerTool(
    "create_event",
    {
      title: "Create a calendar event",
      description:
        "Create a new event. When `tz` (IANA name) is provided, `start`/`end` may be a floating local time (\"2026-05-01T10:00:00\") interpreted in `tz`, or a zoned/UTC ISO that gets converted to `tz` local time; the event is stored with TZID, which keeps recurring events DST-correct. Omit `tz` to store in UTC (`Z`). For all_day=true, pass YYYY-MM-DD strings. Returns the new event `url` and `etag`.",
      inputSchema: {
        account_id: z.string().uuid(),
        calendar_url: z.string().url(),
        summary: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z
          .string()
          .describe(
            "ISO 8601 datetime (floating, zoned or UTC), or YYYY-MM-DD when all_day",
          ),
        end: z
          .string()
          .describe(
            "ISO 8601 datetime (floating, zoned or UTC), or YYYY-MM-DD when all_day",
          ),
        all_day: z.boolean().default(false),
        tz: z
          .string()
          .optional()
          .describe(
            "IANA timezone name (e.g. \"Europe/Paris\"). When set, the event is stored with TZID and recurrences stay correct across DST.",
          ),
        attendees: z.array(attendeeInputSchema).optional(),
        organizer_email: z.string().email().optional(),
        rrule: z
          .string()
          .optional()
          .describe(
            "RFC 5545 RRULE without the leading 'RRULE:' (e.g. 'FREQ=WEEKLY;BYDAY=MO,WE')",
          ),
        reminders: z.array(reminderInputSchema).optional(),
        status: z.enum(["TENTATIVE", "CONFIRMED", "CANCELLED"]).optional(),
      },
    },
    async (args) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, args.account_id);
        const result = await createEvent(acc, args.calendar_url, {
          summary: args.summary,
          description: args.description,
          location: args.location,
          start: args.start,
          end: args.end,
          allDay: args.all_day,
          tz: args.tz,
          attendees: args.attendees,
          organizerEmail: args.organizer_email,
          rrule: args.rrule,
          reminders: args.reminders?.map((r) => ({
            minutesBefore: r.minutes_before,
            action: r.action,
          })),
          status: args.status,
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update a calendar event",
      description:
        "Patch an existing event. The `etag` is REQUIRED — get it from list_events or get_event. A stale etag returns a 412 error; in that case re-fetch the event and retry. Only the fields you pass are modified; pass null to description/location/rrule to clear them. `tz` follows the same semantics as create_event — pass an IANA name to anchor the event to a timezone, pass null to switch to UTC, or omit to keep the existing TZID. Omitting `start`/`end` while changing `tz` re-anchors the existing wall-clock to the new zone.",
      inputSchema: {
        account_id: z.string().uuid(),
        calendar_url: z.string().url(),
        event_url: z.string().url(),
        etag: z.string().min(1),
        summary: z.string().optional(),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        all_day: z.boolean().optional(),
        tz: z.string().nullable().optional(),
        attendees: z.array(attendeeInputSchema).optional(),
        rrule: z.string().nullable().optional(),
        status: z.enum(["TENTATIVE", "CONFIRMED", "CANCELLED"]).optional(),
      },
    },
    async (args) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, args.account_id);
        const result = await updateEvent(acc, args.calendar_url, args.event_url, args.etag, {
          summary: args.summary,
          description: args.description,
          location: args.location,
          start: args.start,
          end: args.end,
          allDay: args.all_day,
          tz: args.tz,
          attendees: args.attendees,
          rrule: args.rrule,
          status: args.status,
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete a calendar event",
      description:
        "Delete an event by its URL. Pass `etag` for safe optimistic-concurrency deletion (a stale etag returns 412); omit it to force-delete.",
      inputSchema: {
        account_id: z.string().uuid(),
        event_url: z.string().url(),
        etag: z.string().optional(),
      },
    },
    async ({ account_id, event_url, etag }) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, account_id);
        const result = await deleteEvent(acc, event_url, etag);
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "find_free_slots",
    {
      title: "Find free time slots",
      description:
        "Find free time slots across one or more calendars within a window. Recurring events are expanded automatically. Optionally restrict to working hours.",
      inputSchema: {
        account_id: z.string().uuid(),
        calendar_urls: z.array(z.string().url()).min(1),
        time_min: z.string(),
        time_max: z.string(),
        duration_minutes: z.number().int().min(5).max(60 * 24),
        work_hours: z
          .object({
            start: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .describe("HH:MM wall-clock in `tz` (UTC if tz omitted)"),
            end: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .describe("HH:MM wall-clock in `tz` (UTC if tz omitted)"),
            tz: z
              .string()
              .optional()
              .describe(
                "IANA timezone name. Working hours are evaluated as wall-clock in this zone, so they stay aligned across DST.",
              ),
            days: z
              .array(z.number().int().min(0).max(6))
              .optional()
              .describe("0=Sunday … 6=Saturday. Defaults to Mon-Fri."),
          })
          .optional(),
      },
    },
    async (args) => {
      try {
        const acc = await requireCalendarAccount(ctx.userId, args.account_id);
        const tMin = parseDate(args.time_min);
        const tMax = parseDate(args.time_max);
        if (!tMin || !tMax) throw new Error("time_min and time_max are required");
        const slots = await findFreeSlots(acc, {
          calendarUrls: args.calendar_urls,
          timeMin: tMin,
          timeMax: tMax,
          durationMinutes: args.duration_minutes,
          workHours: args.work_hours,
        });
        return jsonResult({ free_slots: slots });
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
