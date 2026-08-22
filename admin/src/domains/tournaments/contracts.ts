import { z } from 'zod';

const rewardEntrySchema = z.object({
  mmr_bonus: z.coerce.number().optional(),
}).passthrough();

const bestOfResyncSchema = z.object({
  scanned: z.coerce.number().optional().default(0),
  updated: z.coerce.number().optional().default(0),
  skipped: z.coerce.number().optional().default(0),
  wouldUpdate: z.coerce.number().optional().default(0),
}).partial();

export const tournamentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional().default(''),
  format: z.string(),
  bracketSize: z.coerce.number(),
  category: z.string().nullable().optional(),
  minMmr: z.coerce.number(),
  maxMmr: z.coerce.number(),
  questionCount: z.coerce.number(),
  registrationStart: z.string(),
  registrationEnd: z.string(),
  tournamentStart: z.string(),
  status: z.string(),
  currentRound: z.coerce.number().optional().default(0),
  rewards: z.record(z.string(), rewardEntrySchema).optional().default({}),
  allowSpectators: z.boolean().optional().default(true),
  seedingMode: z.string().optional().default('mmr'),
  bestOfByRound: z.record(z.string(), z.unknown()).optional().default({}),
  grandFinalReset: z.boolean().optional().default(false),
  botPolicy: z.record(z.string(), z.unknown()).optional().default({}),
  registeredCount: z.coerce.number().optional().default(0),
  participantCount: z.coerce.number(),
  isRegistered: z.boolean().optional(),
  eligibilityMmr: z.coerce.number().optional(),
  eligibilityMmrBasis: z.string().optional(),
  isEligible: z.boolean().optional(),
});

export const tournamentsListResponseSchema = z.object({
  tournaments: z.array(tournamentSummarySchema),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

export const tournamentParticipantSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  displayName: z.string(),
  seedNumber: z.coerce.number(),
  mmrAtRegistration: z.coerce.number(),
  status: z.string(),
  isBot: z.boolean().optional().default(false),
  botProfileId: z.string().nullable().optional(),
  botInfluenced: z.boolean().optional().default(false),
  finalPlacement: z.coerce.number().nullable().optional(),
  matchesPlayed: z.coerce.number(),
  matchesWon: z.coerce.number(),
  totalScore: z.coerce.number(),
});

export const tournamentMatchSchema = z.object({
  id: z.string(),
  roundNumber: z.coerce.number(),
  matchNumber: z.coerce.number(),
  bracketType: z.string(),
  player1Id: z.string().nullable().optional(),
  player2Id: z.string().nullable().optional(),
  winnerId: z.string().nullable().optional(),
  player1UserId: z.string().nullable().optional(),
  player2UserId: z.string().nullable().optional(),
  winnerUserId: z.string().nullable().optional(),
  player1IsBot: z.boolean().optional().default(false),
  player2IsBot: z.boolean().optional().default(false),
  winnerIsBot: z.boolean().optional().default(false),
  player1Score: z.coerce.number().nullable().optional(),
  player2Score: z.coerce.number().nullable().optional(),
  status: z.string(),
  scheduledTime: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  spectatorCount: z.coerce.number().optional().default(0),
  nakamaMatchId: z.string().nullable().optional(),
  bestOf: z.coerce.number().optional().default(1),
  seriesWinsPlayer1: z.coerce.number().optional().default(0),
  seriesWinsPlayer2: z.coerce.number().optional().default(0),
  seriesGameCount: z.coerce.number().optional().default(0),
});

export const tournamentDetailSchema = z.object({
  tournament: tournamentSummarySchema.extend({
    timePerQuestionMs: z.coerce.number().nullable().optional(),
    totalRounds: z.coerce.number().nullable().optional(),
    questionPoolIds: z.array(z.string()).optional().default([]),
  }),
  participants: z.array(tournamentParticipantSchema),
  matches: z.array(tournamentMatchSchema),
  isRegistered: z.boolean(),
  userParticipant: z.object({
    id: z.string(),
    status: z.string(),
  }).nullable(),
});

export const tournamentMutationSuccessSchema = z.object({
  success: z.boolean(),
  tournamentId: z.string().nullable().optional(),
  participantId: z.string().nullable().optional(),
  oldSeed: z.coerce.number().optional(),
  newSeed: z.coerce.number().optional(),
  participantCount: z.coerce.number().optional(),
  shuffledCount: z.coerce.number().optional(),
  dryRun: z.boolean().optional(),
  bestOfResync: bestOfResyncSchema.optional(),
});

export type TournamentSummary = z.infer<typeof tournamentSummarySchema>;
export type TournamentParticipant = z.infer<typeof tournamentParticipantSchema>;
export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;
export type TournamentDetail = z.infer<typeof tournamentDetailSchema>;
export type TournamentsListResponse = z.infer<typeof tournamentsListResponseSchema>;
export type TournamentMutationSuccess = z.infer<typeof tournamentMutationSuccessSchema>;
