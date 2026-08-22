import { z } from 'zod';

const tournamentBotDifficultyProfileSchema = z.object({
  baseAccuracy: z.coerce.number(),
  minAccuracy: z.coerce.number(),
  maxAccuracy: z.coerce.number(),
  roundAccuracyBonus: z.coerce.number(),
  minDelayMs: z.coerce.number(),
  maxDelayMs: z.coerce.number(),
  roundDelayReductionMs: z.coerce.number(),
  nearMissChance: z.coerce.number(),
});

const tournamentBotPolicySchema = z.object({
  enabled: z.boolean(),
  fillOnStart: z.boolean(),
  replaceMissingBeforeMatch: z.boolean(),
  botMmr: z.coerce.number(),
  skipMmrBonusWhenBotInfluenced: z.boolean(),
  difficulty: tournamentBotDifficultyProfileSchema,
});

const matchPacingProfileSchema = z.object({
  preset: z.string(),
  countdownSeconds: z.coerce.number(),
  revealDelayMs: z.coerce.number(),
  revealSuspenseMs: z.coerce.number(),
  revealRevealMs: z.coerce.number(),
  revealEffectsMs: z.coerce.number(),
  revealScoresMs: z.coerce.number(),
  roundPulseEnabled: z.boolean(),
  roundPulseStartDelayMs: z.coerce.number(),
  roundPulseCompleteDelayMs: z.coerce.number(),
});

const flowPacingProfilesSchema = z.object({
  rankedPreset: z.string(),
  practicePreset: z.string(),
  tournamentPreset: z.string(),
});

const flowPacingResolvedSchema = z.object({
  ranked: matchPacingProfileSchema,
  practice: matchPacingProfileSchema,
  tournament: matchPacingProfileSchema,
});

export const gameSettingsResponseSchema = z.object({
  questionsPerMatch: z.coerce.number().optional(),
  questionsPerMatchNormal: z.coerce.number().optional(),
  questionsPerMatchVocabulary: z.coerce.number().optional(),
  maxQuestionsPerMatchNormal: z.coerce.number().optional(),
  maxQuestionsPerMatchVocabulary: z.coerce.number().optional(),
  timePerQuestion: z.coerce.number().optional(),
  flowPacingProfiles: flowPacingProfilesSchema.optional(),
  flowPacingResolved: flowPacingResolvedSchema.optional(),
  communityAlertsEnabled: z.boolean().optional(),
  communityOnlineThreshold: z.coerce.number().optional(),
  communityOnlineCooldownMinutes: z.coerce.number().optional(),
  communityDispatchBatchSize: z.coerce.number().optional(),
  telegramDispatchPerRun: z.coerce.number().optional(),
  telegramMiniappDeeplinkBase: z.string().optional(),
  tournamentBotPolicy: tournamentBotPolicySchema.optional(),
  tournamentBotEnabled: z.boolean().optional(),
  tournamentBotFillOnStart: z.boolean().optional(),
  tournamentBotReplaceMissingBeforeMatch: z.boolean().optional(),
  tournamentBotMmr: z.coerce.number().optional(),
  tournamentBotSkipMmrBonusWhenBotInfluenced: z.boolean().optional(),
  tournamentBotBaseAccuracy: z.coerce.number().optional(),
  tournamentBotMinAccuracy: z.coerce.number().optional(),
  tournamentBotMaxAccuracy: z.coerce.number().optional(),
  tournamentBotRoundAccuracyBonus: z.coerce.number().optional(),
  tournamentBotMinDelayMs: z.coerce.number().optional(),
  tournamentBotMaxDelayMs: z.coerce.number().optional(),
  tournamentBotRoundDelayReductionMs: z.coerce.number().optional(),
  tournamentBotNearMissChance: z.coerce.number().optional(),
}).passthrough();

export const gameSettingsMutationSuccessSchema = z.object({
  success: z.boolean(),
}).passthrough();

export type GameSettingsResponseContract = z.infer<typeof gameSettingsResponseSchema>;
