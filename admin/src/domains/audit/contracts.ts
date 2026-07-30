import { z } from 'zod';

const auditValueSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const auditLogEntrySchema = z.object({
  id: z.string(),
  adminId: z.string(),
  adminName: z.string(),
  adminTelegramId: z.coerce.number(),
  actionType: z.string(),
  targetType: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  oldValue: auditValueSchema,
  newValue: auditValueSchema,
  metadata: auditValueSchema,
  createdAt: z.string(),
});

export const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogEntrySchema),
  total: z.coerce.number(),
  page: z.coerce.number(),
  pageSize: z.coerce.number(),
  totalPages: z.coerce.number(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  actionTypes: z.array(z.string()).optional().default([]),
  targetTypes: z.array(z.string()).optional().default([]),
});

export type AuditLogEntryContract = z.infer<typeof auditLogEntrySchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;

