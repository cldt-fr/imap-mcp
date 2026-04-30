import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { WritingStyle } from "@/lib/writing-style";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_clerk_user_id_idx").on(t.clerkUserId)],
);

export const mailAccounts = pgTable(
  "mail_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    email: text("email").notNull(),
    fromName: text("from_name"),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull(),
    imapSecure: boolean("imap_secure").notNull().default(true),
    imapUser: text("imap_user").notNull(),
    imapPasswordEnc: text("imap_password_enc").notNull(),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    smtpSecure: boolean("smtp_secure").notNull().default(true),
    smtpUser: text("smtp_user").notNull(),
    smtpPasswordEnc: text("smtp_password_enc").notNull(),
    signatureHtml: text("signature_html"),
    writingStyle: jsonb("writing_style").$type<WritingStyle>(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mail_accounts_user_id_idx").on(t.userId)],
);

export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientSecretHash: text("client_secret_hash"),
  redirectUris: text("redirect_uris").array().notNull(),
  name: text("name"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthAuthCodes = pgTable(
  "oauth_auth_codes",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("oauth_auth_codes_expires_at_idx").on(t.expiresAt)],
);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash"),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("oauth_tokens_access_token_hash_idx").on(t.accessTokenHash),
    index("oauth_tokens_refresh_token_hash_idx").on(t.refreshTokenHash),
    index("oauth_tokens_user_id_idx").on(t.userId),
  ],
);

export const calendarAccounts = pgTable(
  "calendar_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    caldavUrl: text("caldav_url").notNull(),
    username: text("username").notNull(),
    passwordEnc: text("password_enc").notNull(),
    defaultCalendarUrl: text("default_calendar_url"),
    color: text("color"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("calendar_accounts_user_id_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type MailAccount = typeof mailAccounts.$inferSelect;
export type NewMailAccount = typeof mailAccounts.$inferInsert;
export type CalendarAccount = typeof calendarAccounts.$inferSelect;
export type NewCalendarAccount = typeof calendarAccounts.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthAuthCode = typeof oauthAuthCodes.$inferSelect;
export type OAuthToken = typeof oauthTokens.$inferSelect;
