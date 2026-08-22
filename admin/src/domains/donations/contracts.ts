import { z } from 'zod';

const stringValueSchema = z.string().nullable().optional().transform((value) => value ?? '');

export const donationStatsSchema = z.object({
  totalCents: z.coerce.number().optional().default(0),
  totalCount: z.coerce.number().optional().default(0),
  monthCents: z.coerce.number().optional().default(0),
  monthCount: z.coerce.number().optional().default(0),
  uniqueDonors: z.coerce.number().optional().default(0),
  avgDonationCents: z.coerce.number().optional().default(0),
});

export const donorSchema = z.object({
  rank: z.coerce.number().optional().default(0),
  displayName: stringValueSchema,
  totalDonatedCents: z.coerce.number().optional().default(0),
  donationCount: z.coerce.number().optional().default(0),
  isAnonymous: z.boolean().optional().default(false),
});

export const donorsResponseSchema = z.object({
  donors: z.array(donorSchema).optional().default([]),
});

export const donationConfirmResponseSchema = z.object({
  success: z.boolean(),
  donationId: z.string().optional(),
  tierName: z.string().nullable().optional(),
  rewardsDisabled: z.boolean().optional(),
});

export type DonationStatsContract = z.infer<typeof donationStatsSchema>;
export type DonorContract = z.infer<typeof donorSchema>;
