import { z } from "zod";

export const calendarAccountCreateSchema = z.object({
  label: z.string().min(1).max(80),
  caldavUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  defaultCalendarUrl: z.string().url().optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
  isDefault: z.boolean().optional(),
});

export const calendarAccountUpdateSchema = calendarAccountCreateSchema.partial().extend({
  password: z.string().min(1).optional(),
});

export type CalendarAccountCreateInput = z.infer<typeof calendarAccountCreateSchema>;
export type CalendarAccountUpdateInput = z.infer<typeof calendarAccountUpdateSchema>;
