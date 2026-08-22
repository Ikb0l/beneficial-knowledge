import { z } from 'zod';

export const adminSavedViewSchema = z.object({
  id: z.string(),
  label: z.string(),
  query: z.string(),
  updatedAt: z.number(),
});

export const adminPreferencesSchema = z.object({
  savedViews: z.record(z.string(), z.array(adminSavedViewSchema)).default({}),
  pagePreferences: z.record(z.string(), z.unknown()).default({}),
});

export const adminPreferencesResponseSchema = z.object({
  preferences: adminPreferencesSchema,
});

export const adminSavedViewsMutationSchema = z.object({
  success: z.boolean(),
  views: z.array(adminSavedViewSchema),
  preferences: adminPreferencesSchema,
});

export type AdminSavedViewContract = z.infer<typeof adminSavedViewSchema>;
export type AdminPreferencesContract = z.infer<typeof adminPreferencesSchema>;
