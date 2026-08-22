import { z } from 'zod';

const homeBannerSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional().default(''),
  imageUrl: z.string().optional().default(''),
  actionUrl: z.string().optional().default(''),
  actionType: z.enum(['url', 'category', 'tournament', 'screen']),
  actionData: z.record(z.string(), z.unknown()).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  createdBy: z.string().optional().nullable(),
  createdAt: z.string().optional().nullable(),
  updatedAt: z.string().optional().nullable(),
});

const homeSectionSchema = z.object({
  id: z.string(),
  sectionKey: z.string(),
  name: z.string(),
  isVisible: z.boolean(),
  displayOrder: z.number(),
  config: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().optional().nullable(),
});

const featuredItemSchema = z.object({
  id: z.string(),
  itemType: z.enum(['category', 'tournament']),
  itemId: z.string(),
  itemName: z.string().optional().nullable(),
  categoryKey: z.string().optional().nullable(),
  categoryIcon: z.string().optional().nullable(),
  tournamentStatus: z.string().optional().nullable(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  createdAt: z.string().optional().nullable(),
});

const homeCategorySchema = z.object({
  id: z.string(),
  categoryKey: z.string(),
  name: z.string(),
  icon: z.string().optional().default(''),
  isActive: z.boolean(),
  questionCount: z.number(),
});

const tournamentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
});

const homeControlWarningSchema = z.object({
  id: z.string(),
  tone: z.enum(['info', 'warning', 'danger']),
  title: z.string(),
  description: z.string(),
});

export const homeControlSnapshotSchema = z.object({
  banners: z.array(homeBannerSchema),
  sections: z.array(homeSectionSchema),
  featuredItems: z.array(featuredItemSchema),
  categories: z.array(homeCategorySchema),
  tournaments: z.array(tournamentSummarySchema),
  warnings: z.array(homeControlWarningSchema),
});

export const homeControlMutationSuccessSchema = z.object({
  success: z.boolean(),
});

export type HomeControlSnapshot = z.infer<typeof homeControlSnapshotSchema>;
export type HomeControlWarning = z.infer<typeof homeControlWarningSchema>;
export type HomeControlMutationSuccess = z.infer<typeof homeControlMutationSuccessSchema>;
