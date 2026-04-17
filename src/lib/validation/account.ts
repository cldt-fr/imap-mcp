import { z } from "zod";
import { writingStyleSchema } from "@/lib/writing-style";

export const accountCreateSchema = z.object({
  label: z.string().min(1).max(80),
  email: z.string().email(),
  fromName: z.string().max(120).optional().nullable(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  imapUser: z.string().min(1),
  imapPassword: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().min(1),
  signatureHtml: z.string().max(20000).optional().nullable(),
  writingStyle: writingStyleSchema.optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  imapPassword: z.string().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
