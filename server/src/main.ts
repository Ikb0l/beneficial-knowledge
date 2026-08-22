import { checkRateLimit, checkRateLimitByKey } from './rate-limiter';
import {
  createLeaderboards,
  rpcCronCommunityOnlineDetector,
  rpcCronNotificationCampaignDispatch,
  rpcCronNotificationCleanup,
  rpcCronTournamentNoshowCheck,
  rpcCronTournamentReminders,
  rpcCronTournamentStatusSync,
} from './main/cron';
import { getCategoriesFromDb } from './main/config';
import { rpcGetCategories, rpcGetCategoryMmr, rpcGetDetailedProfile, rpcGetLeaderboard, rpcGetMatchHistory, rpcGetOnlineStats, rpcGetProfile, rpcGetQuestionStats, rpcGetQuestions, rpcHealthCheck, rpcOnlinePing, rpcServerStatus, rpcStartBotMatch, rpcStartPracticeMatch } from './main/rpc-core';
import { afterAuthenticateCustom, beforeAuthenticateCustom, rpcTelegramAuth } from './main/auth-telegram';
import { rpcAcceptFriendRequest, rpcChallengeFriend, rpcGetFriendActivity, rpcGetFriendRequests, rpcGetFriends, rpcRejectFriendRequest, rpcRemoveFriend, rpcSearchUsers, rpcSendFriendRequest } from './main/friends';
import { rpcUpdateProfile } from './main/profile';
import { rpcAdminAuthenticate, rpcAdminBanUser, rpcAdminBulkDeleteQuestions, rpcAdminBulkImportQuestions, rpcAdminContinueRankedReset, rpcAdminCreateCategory, rpcAdminCreateQuestion, rpcAdminDeleteCategory, rpcAdminDeleteQuestion, rpcAdminDeleteSavedView, rpcAdminExportQuestions, rpcAdminGetActivityChart, rpcAdminGetDashboardSnapshot, rpcAdminGetDashboardStats, rpcAdminGetJobsSnapshot, rpcAdminGetMatch, rpcAdminGetPreferences, rpcAdminGetQuestion, rpcAdminGetRankedResetStatus, rpcAdminGetUser, rpcAdminListCategories, rpcAdminListMatches, rpcAdminListQuestions, rpcAdminListUsers, rpcAdminRefreshQuestionCache, rpcAdminReorderCategories, rpcAdminStartRankedReset, rpcAdminToggleQuestion, rpcAdminUnbanUser, rpcAdminUpdateCategory, rpcAdminUpdatePreferences, rpcAdminUpdateQuestion, rpcAdminUpdateUserMmr, rpcAdminUpsertSavedView, rpcAdminVerifySession } from './main/admin';
import { rpcAdminApproveAiQuestion, rpcAdminCreateAiProviderProfile, rpcAdminCreateAiSourcePack, rpcAdminDeleteAiCategoryOverride, rpcAdminDeleteAiProviderProfile, rpcAdminDeleteAiSourcePack, rpcAdminGenerateAiQuestions, rpcAdminGetAiGenerationJob, rpcAdminGetAiSettings, rpcAdminListAiGenerationJobs, rpcAdminListAiProviderProfiles, rpcAdminListAiReviewQueue, rpcAdminListAiSourcePacks, rpcAdminRejectAiQuestion, rpcAdminRetryAiQuestion, rpcAdminSetAiProviderCredential, rpcAdminToggleAiKillSwitch, rpcAdminUpdateAiProviderProfile, rpcAdminUpdateAiSettings, rpcAdminUpdateAiSourcePack, rpcAdminUpsertAiCategoryOverride, rpcCronAiGenerationJobs } from './main/ai-questions';
import { rpcAdminCreateRankTier, rpcAdminDeleteRankTier, rpcAdminListRankTiers, rpcAdminUpdateRankTier, rpcGetRankTiers } from './main/rank-tiers';
import { rpcAdminCreateBanner, rpcAdminDeleteBanner, rpcAdminGetHomeControlSnapshot, rpcAdminListBanners, rpcAdminListFeaturedItems, rpcAdminListHomeSections, rpcAdminSetFeaturedItems, rpcAdminUpdateBanner, rpcAdminUpdateHomeSections, rpcGetHomeConfig } from './main/home-page';
import { rpcAdminGetAuditLog, rpcAdminListAuditLogs, rpcAdminListBans } from './main/audit-logs';
import { rpcAdminUpdateGameSettings, rpcGetGameSettings } from './main/game-settings';
import { rpcTelegramWebLogin, rpcValidateReferralCode, rpcWebLogin, rpcWebLogout, rpcWebRegister, rpcGetMyReferralCode, rpcAdminCreateReferralCode, rpcAdminListReferralCodes, rpcAdminToggleReferralCode, rpcAdminGetReferralCodeUsage } from './main/web-auth';
import { onMatchmakerMatched } from './main/matchmaker';
import { matchInit, matchJoinAttempt, matchJoin, matchLeave, matchLoop, matchTerminate, matchSignal } from './main/match-handlers';
import { refreshQuestionCache } from './main/match-helpers';
import { ensureRuntimeLocksTable } from './main/runtime-locks';
import { rpcAdminCreateSeason, rpcAdminEndSeason, rpcAdminListSeasons, rpcGetCurrentSeason, rpcGetSeasonLeaderboard } from './features/seasons';
import { rpcAdminCancelTournament, rpcAdminDisqualifyParticipant, rpcAdminForfeitParticipant, rpcAdminPauseTournament, rpcAdminRepairTournamentBestOf, rpcAdminResumeTournament, rpcAdminUpdateParticipantSeed, rpcAdminUpdateTournament, rpcAdminCreateTournament, rpcAdminDeleteTournament, rpcAdminStartTournament, rpcAdminShuffleTournamentSeeds, rpcAdminGetTournamentProgressSnapshot, rpcGetMyTournaments, rpcGetTournamentDetails, rpcGetTournaments, rpcRegisterForTournament, rpcWithdrawFromTournament, rpcWithdrawFromWaitlist } from './features/tournaments';
import { rpcReportTournamentMatchResult, rpcStartTournamentMatch } from './features/tournament-matches';
import { rpcGetSpectatorMatches } from './features/spectator';
import { rpcCheckActiveTournamentMatch, rpcGetCurrentTournamentAction, rpcTournamentReadyCheck } from './features/tournament-experience';
import { rpcGetNotificationPreferences, rpcGetNotifications, rpcMarkNotificationRead, rpcRegisterPushToken, rpcUpdateNotificationPreferences } from './features/notifications';
import { rpcAdminGetAnalyticsDashboard, rpcAdminGetQuestionAnalytics, rpcAdminGetRetentionCohorts, rpcAdminGetTournamentAnalytics, rpcAdminGetUserEngagement } from './features/analytics';
import { rpcAdminGetDonationStats, rpcConfirmDonation, rpcGetDonorLeaderboard, rpcInitiateDonation } from './features/donations';
import { rpcConfirmStarsPayment, rpcCreateStarsInvoice } from './features/telegram-stars';
import { rpcAcceptChallenge, rpcDeclineChallenge } from './features/challenges';
import { rpcBlockUser, rpcGetBlockedUsers, rpcUnblockUser } from './features/block';
import { setTelegramBotToken } from './main/constants';

function getGlobalScope(): {[key: string]: any} {
  if (typeof globalThis !== 'undefined') {
    return globalThis as {[key: string]: any};
  }
  return Function('return this')() as {[key: string]: any};
}

function exposeGlobals(entries: {[key: string]: any}): void {
  var scope = getGlobalScope();
  for (var key in entries) {
    if (Object.prototype.hasOwnProperty.call(entries, key)) {
      scope[key] = entries[key];
    }
  }
}

// INITIALIZATION - Must be at the end, after all functions are defined
// ============================================================================

// Named rate-limited RPC wrappers (Nakama requires named functions, not inline literals)
function rpcSearchUsersRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'search_users');
  return rpcSearchUsers(ctx, logger, nk, payload);
}

function rpcSendFriendRequestRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'send_friend_request');
  return rpcSendFriendRequest(ctx, logger, nk, payload);
}

function rpcChallengeFriendRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'challenge_friend');
  return rpcChallengeFriend(ctx, logger, nk, payload);
}

function rpcBlockUserRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'block_user');
  return rpcBlockUser(ctx, logger, nk, payload);
}

function rpcRegisterForTournamentRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'register_for_tournament');
  return rpcRegisterForTournament(ctx, logger, nk, payload);
}

function getStartTournamentMatchRateKey(
  payload: string
): string {
  if (!payload) {
    return 'match_unknown';
  }

  try {
    var request = JSON.parse(payload || '{}');
    var matchId = typeof request.matchId === 'string' ? request.matchId.trim() : '';
    if (matchId) {
      return 'match_' + matchId;
    }
  } catch {
    // Ignore malformed payloads here; handler will validate and return canonical errors.
  }

  return 'match_unknown';
}

function rpcStartTournamentMatchRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var rateKey = getStartTournamentMatchRateKey(payload);
  checkRateLimitByKey(ctx, logger, nk, 'start_tournament_match', rateKey);
  return rpcStartTournamentMatch(ctx, logger, nk, payload);
}

function rpcCreateStarsInvoiceRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'create_stars_invoice');
  return rpcCreateStarsInvoice(ctx, logger, nk, payload);
}

function rpcConfirmStarsPaymentRateLimited(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  checkRateLimit(ctx, logger, nk, 'confirm_stars_payment');
  return rpcConfirmStarsPayment(ctx, logger, nk, payload);
}

// ============================================================================

export const InitModule: nkruntime.InitModule = function(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info('Beneficial Knowledge server starting...');
  var botToken = String(ctx.env['TELEGRAM_BOT_TOKEN'] || '');
  setTelegramBotToken(botToken);
  if (!botToken) {
    logger.warn(
      'TELEGRAM_BOT_TOKEN is not set. Telegram push notifications will be disabled. ' +
      'Set TELEGRAM_BOT_TOKEN environment variable or add telegram_bot_token to game_config.'
    );
  }

  exposeGlobals({
    afterAuthenticateCustom: afterAuthenticateCustom,
    beforeAuthenticateCustom: beforeAuthenticateCustom,
    matchInit: matchInit,
    matchJoin: matchJoin,
    matchJoinAttempt: matchJoinAttempt,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchSignal: matchSignal,
    matchTerminate: matchTerminate,
    onMatchmakerMatched: onMatchmakerMatched,
    rpcAcceptChallenge: rpcAcceptChallenge,
    rpcAcceptFriendRequest: rpcAcceptFriendRequest,
    rpcAdminAuthenticate: rpcAdminAuthenticate,
    rpcAdminApproveAiQuestion: rpcAdminApproveAiQuestion,
    rpcAdminBanUser: rpcAdminBanUser,
    rpcAdminBulkDeleteQuestions: rpcAdminBulkDeleteQuestions,
    rpcAdminBulkImportQuestions: rpcAdminBulkImportQuestions,
    rpcAdminCancelTournament: rpcAdminCancelTournament,
    rpcAdminCreateAiProviderProfile: rpcAdminCreateAiProviderProfile,
    rpcAdminCreateAiSourcePack: rpcAdminCreateAiSourcePack,
    rpcAdminCreateBanner: rpcAdminCreateBanner,
    rpcAdminCreateCategory: rpcAdminCreateCategory,
    rpcAdminCreateRankTier: rpcAdminCreateRankTier,
    rpcAdminCreateReferralCode: rpcAdminCreateReferralCode,
    rpcAdminCreateSeason: rpcAdminCreateSeason,
    rpcAdminCreateTournament: rpcAdminCreateTournament,
    rpcAdminDeleteAiCategoryOverride: rpcAdminDeleteAiCategoryOverride,
    rpcAdminDeleteAiProviderProfile: rpcAdminDeleteAiProviderProfile,
    rpcAdminDeleteAiSourcePack: rpcAdminDeleteAiSourcePack,
    rpcAdminDeleteBanner: rpcAdminDeleteBanner,
    rpcAdminDeleteCategory: rpcAdminDeleteCategory,
    rpcAdminDeleteQuestion: rpcAdminDeleteQuestion,
    rpcAdminDeleteRankTier: rpcAdminDeleteRankTier,
    rpcAdminDeleteTournament: rpcAdminDeleteTournament,
    rpcAdminDisqualifyParticipant: rpcAdminDisqualifyParticipant,
    rpcAdminEndSeason: rpcAdminEndSeason,
    rpcAdminExportQuestions: rpcAdminExportQuestions,
    rpcAdminForfeitParticipant: rpcAdminForfeitParticipant,
    rpcAdminGenerateAiQuestions: rpcAdminGenerateAiQuestions,
    rpcAdminGetActivityChart: rpcAdminGetActivityChart,
    rpcAdminGetAiGenerationJob: rpcAdminGetAiGenerationJob,
    rpcAdminGetAiSettings: rpcAdminGetAiSettings,
    rpcAdminGetAnalyticsDashboard: rpcAdminGetAnalyticsDashboard,
    rpcAdminGetAuditLog: rpcAdminGetAuditLog,
    rpcAdminGetDashboardStats: rpcAdminGetDashboardStats,
    rpcAdminGetDonationStats: rpcAdminGetDonationStats,
    rpcAdminGetMatch: rpcAdminGetMatch,
    rpcAdminGetQuestion: rpcAdminGetQuestion,
    rpcAdminGetQuestionAnalytics: rpcAdminGetQuestionAnalytics,
    rpcAdminGetReferralCodeUsage: rpcAdminGetReferralCodeUsage,
    rpcAdminGetRetentionCohorts: rpcAdminGetRetentionCohorts,
    rpcAdminGetTournamentAnalytics: rpcAdminGetTournamentAnalytics,
    rpcAdminGetUser: rpcAdminGetUser,
    rpcAdminGetUserEngagement: rpcAdminGetUserEngagement,
    rpcAdminListAiGenerationJobs: rpcAdminListAiGenerationJobs,
    rpcAdminListAiProviderProfiles: rpcAdminListAiProviderProfiles,
    rpcAdminListAiReviewQueue: rpcAdminListAiReviewQueue,
    rpcAdminListAiSourcePacks: rpcAdminListAiSourcePacks,
    rpcAdminListAuditLogs: rpcAdminListAuditLogs,
    rpcAdminListBanners: rpcAdminListBanners,
    rpcAdminListBans: rpcAdminListBans,
    rpcAdminListCategories: rpcAdminListCategories,
    rpcAdminListFeaturedItems: rpcAdminListFeaturedItems,
    rpcAdminListHomeSections: rpcAdminListHomeSections,
    rpcAdminListMatches: rpcAdminListMatches,
    rpcAdminListQuestions: rpcAdminListQuestions,
    rpcAdminListRankTiers: rpcAdminListRankTiers,
    rpcAdminListReferralCodes: rpcAdminListReferralCodes,
    rpcAdminListSeasons: rpcAdminListSeasons,
    rpcAdminListUsers: rpcAdminListUsers,
    rpcAdminPauseTournament: rpcAdminPauseTournament,
    rpcAdminRefreshQuestionCache: rpcAdminRefreshQuestionCache,
    rpcAdminReorderCategories: rpcAdminReorderCategories,
    rpcAdminResumeTournament: rpcAdminResumeTournament,
    rpcAdminSetFeaturedItems: rpcAdminSetFeaturedItems,
    rpcAdminSetAiProviderCredential: rpcAdminSetAiProviderCredential,
    rpcAdminShuffleTournamentSeeds: rpcAdminShuffleTournamentSeeds,
    rpcAdminStartTournament: rpcAdminStartTournament,
    rpcAdminToggleAiKillSwitch: rpcAdminToggleAiKillSwitch,
    rpcAdminToggleReferralCode: rpcAdminToggleReferralCode,
    rpcAdminToggleQuestion: rpcAdminToggleQuestion,
    rpcAdminUnbanUser: rpcAdminUnbanUser,
    rpcAdminUpdateAiProviderProfile: rpcAdminUpdateAiProviderProfile,
    rpcAdminUpdateAiSettings: rpcAdminUpdateAiSettings,
    rpcAdminUpdateAiSourcePack: rpcAdminUpdateAiSourcePack,
    rpcAdminUpdateBanner: rpcAdminUpdateBanner,
    rpcAdminUpsertAiCategoryOverride: rpcAdminUpsertAiCategoryOverride,
    rpcAdminUpdateCategory: rpcAdminUpdateCategory,
    rpcAdminUpdateGameSettings: rpcAdminUpdateGameSettings,
    rpcAdminUpdateHomeSections: rpcAdminUpdateHomeSections,
    rpcAdminUpdateParticipantSeed: rpcAdminUpdateParticipantSeed,
    rpcAdminUpdateQuestion: rpcAdminUpdateQuestion,
    rpcAdminUpdateRankTier: rpcAdminUpdateRankTier,
    rpcAdminUpdateTournament: rpcAdminUpdateTournament,
    rpcAdminUpdateUserMmr: rpcAdminUpdateUserMmr,
    rpcAdminVerifySession: rpcAdminVerifySession,
    rpcAdminRejectAiQuestion: rpcAdminRejectAiQuestion,
    rpcAdminRetryAiQuestion: rpcAdminRetryAiQuestion,
    rpcBlockUser: rpcBlockUser,
    rpcCheckActiveTournamentMatch: rpcCheckActiveTournamentMatch,
    rpcConfirmDonation: rpcConfirmDonation,
    rpcConfirmStarsPayment: rpcConfirmStarsPayment,
    rpcCreateStarsInvoice: rpcCreateStarsInvoice,
    rpcCronNotificationCleanup: rpcCronNotificationCleanup,
    rpcCronAiGenerationJobs: rpcCronAiGenerationJobs,
    rpcCronTournamentNoshowCheck: rpcCronTournamentNoshowCheck,
    rpcCronTournamentReminders: rpcCronTournamentReminders,
    rpcCronTournamentStatusSync: rpcCronTournamentStatusSync,
    rpcDeclineChallenge: rpcDeclineChallenge,
    rpcGetBlockedUsers: rpcGetBlockedUsers,
    rpcGetCategories: rpcGetCategories,
    rpcGetCategoryMmr: rpcGetCategoryMmr,
    rpcGetCurrentSeason: rpcGetCurrentSeason,
    rpcGetDetailedProfile: rpcGetDetailedProfile,
    rpcGetDonorLeaderboard: rpcGetDonorLeaderboard,
    rpcGetFriendActivity: rpcGetFriendActivity,
    rpcGetFriendRequests: rpcGetFriendRequests,
    rpcGetFriends: rpcGetFriends,
    rpcGetGameSettings: rpcGetGameSettings,
    rpcGetHomeConfig: rpcGetHomeConfig,
    rpcGetLeaderboard: rpcGetLeaderboard,
    rpcGetMatchHistory: rpcGetMatchHistory,
    rpcGetMyReferralCode: rpcGetMyReferralCode,
    rpcGetMyTournaments: rpcGetMyTournaments,
    rpcGetNotificationPreferences: rpcGetNotificationPreferences,
    rpcGetNotifications: rpcGetNotifications,
    rpcGetOnlineStats: rpcGetOnlineStats,
    rpcGetProfile: rpcGetProfile,
    rpcGetQuestionStats: rpcGetQuestionStats,
    rpcGetQuestions: rpcGetQuestions,
    rpcGetRankTiers: rpcGetRankTiers,
    rpcGetSeasonLeaderboard: rpcGetSeasonLeaderboard,
    rpcGetSpectatorMatches: rpcGetSpectatorMatches,
    rpcGetTournaments: rpcGetTournaments,
    rpcGetTournamentDetails: rpcGetTournamentDetails,
    rpcGetUserEngagement: rpcAdminGetUserEngagement,
    rpcHealthCheck: rpcHealthCheck,
    rpcInitiateDonation: rpcInitiateDonation,
    rpcMarkNotificationRead: rpcMarkNotificationRead,
    rpcOnlinePing: rpcOnlinePing,
    rpcRegisterForTournament: rpcRegisterForTournament,
    rpcRegisterPushToken: rpcRegisterPushToken,
    rpcRejectFriendRequest: rpcRejectFriendRequest,
    rpcRemoveFriend: rpcRemoveFriend,
    rpcReportTournamentMatchResult: rpcReportTournamentMatchResult,
    rpcSearchUsersRateLimited: rpcSearchUsersRateLimited,
    rpcSendFriendRequestRateLimited: rpcSendFriendRequestRateLimited,
    rpcServerStatus: rpcServerStatus,
    rpcStartBotMatch: rpcStartBotMatch,
    rpcStartPracticeMatch: rpcStartPracticeMatch,
    rpcStartTournamentMatch: rpcStartTournamentMatch,
    rpcTelegramAuth: rpcTelegramAuth,
    rpcTelegramWebLogin: rpcTelegramWebLogin,
    rpcTournamentReadyCheck: rpcTournamentReadyCheck,
    rpcUnblockUser: rpcUnblockUser,
    rpcUpdateNotificationPreferences: rpcUpdateNotificationPreferences,
    rpcUpdateProfile: rpcUpdateProfile,
    rpcValidateReferralCode: rpcValidateReferralCode,
    rpcWebLogin: rpcWebLogin,
    rpcWebLogout: rpcWebLogout,
    rpcWebRegister: rpcWebRegister,
    rpcWithdrawFromTournament: rpcWithdrawFromTournament,
  });

  // Create leaderboards
  createLeaderboards(nk, logger);

  ensureRuntimeLocksTable(nk, logger);

  // Pre-warm question cache for all categories (reduces DB load on first matches)
  logger.info('Pre-warming question cache...');
  var allCategoriesForCache = getCategoriesFromDb(nk, logger);
  for (var categoryId in allCategoriesForCache) {
    refreshQuestionCache(categoryId, nk, logger);
  }
  logger.info('Question cache pre-warmed for ' + Object.keys(allCategoriesForCache).length + ' categories');

  // Ensure block system tables exist (runtime migration)
  try {
    nk.sqlExec(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        blocked_user_id UUID NOT NULL,
        blocked_at TIMESTAMPTZ DEFAULT NOW(),
        reason VARCHAR(255),
        UNIQUE(user_id, blocked_user_id)
      )
    `);
    nk.sqlExec(`
      CREATE TABLE IF NOT EXISTS pending_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenger_id UUID NOT NULL,
        challenged_id UUID NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(30) DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'auto_declined', 'expired_challenger_busy')),
        match_id UUID
      )
    `);
    nk.sqlExec(`ALTER TABLE pending_challenges ALTER COLUMN status TYPE VARCHAR(30)`);
    nk.sqlExec(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'pending_challenges'::regclass
            AND contype = 'u'
            AND conname = 'pending_challenges_challenger_id_challenged_id_status_key'
        ) THEN
          ALTER TABLE pending_challenges
          DROP CONSTRAINT pending_challenges_challenger_id_challenged_id_status_key;
        END IF;
      END $$;
    `);
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users(user_id)`);
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_user_id)`);
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS idx_pending_challenges_challenged ON pending_challenges(challenged_id, status)`);
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS idx_pending_challenges_expires ON pending_challenges(expires_at) WHERE status = 'pending'`);
    // Normalize existing pending challenges before enforcing one-active-outgoing and one-active-incoming rules.
    nk.sqlExec(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY challenger_id ORDER BY created_at DESC, id DESC) AS rn
        FROM pending_challenges
        WHERE status = 'pending'
      )
      UPDATE pending_challenges p
      SET status = 'auto_declined'
      FROM ranked r
      WHERE p.id = r.id AND r.rn > 1
    `);
    nk.sqlExec(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY challenged_id ORDER BY created_at DESC, id DESC) AS rn
        FROM pending_challenges
        WHERE status = 'pending'
      )
      UPDATE pending_challenges p
      SET status = 'auto_declined'
      FROM ranked r
      WHERE p.id = r.id AND r.rn > 1
    `);
    nk.sqlExec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_challenger_single_pending
      ON pending_challenges (challenger_id)
      WHERE status = 'pending'
    `);
    nk.sqlExec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_challenged_single_pending
      ON pending_challenges (challenged_id)
      WHERE status = 'pending'
    `);
    nk.sqlExec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_pair_pending
      ON pending_challenges (
        LEAST(challenger_id::text, challenged_id::text),
        GREATEST(challenger_id::text, challenged_id::text)
      )
      WHERE status = 'pending'
    `);
    logger.info('Block system tables initialized');
  } catch (error) {
    logger.warn('Block system tables may already exist: ' + error);
  }

  // Ensure tournament_matches has last_activity_at for disconnect/cleanup tracking
  try {
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ`);
    nk.sqlExec(`
      UPDATE tournament_matches
      SET last_activity_at = COALESCE(last_activity_at, started_at, created_at)
      WHERE last_activity_at IS NULL
    `);
    logger.info('Tournament match activity tracking ensured');
  } catch (error) {
    logger.warn('Failed to ensure tournament match activity tracking: ' + error);
  }

  // Ensure tournament_matches has category for "mixed" tournaments (per-match category selection)
  try {
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS category VARCHAR(50)`);
    logger.info('Tournament match category ensured');
  } catch (error) {
    logger.warn('Failed to ensure tournament match category: ' + error);
  }

  // Ensure tournament config + series tracking columns exist
  try {
    nk.sqlExec(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS seeding_mode VARCHAR(50) DEFAULT 'mmr'`);
    nk.sqlExec(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS best_of_by_round JSONB DEFAULT '{}'::jsonb`);
    nk.sqlExec(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS grand_final_reset BOOLEAN DEFAULT false`);
    nk.sqlExec(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registered_count INTEGER DEFAULT 0`);
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS best_of INTEGER DEFAULT 1`);
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS series_wins_player1 INTEGER DEFAULT 0`);
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS series_wins_player2 INTEGER DEFAULT 0`);
    nk.sqlExec(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS series_game_count INTEGER DEFAULT 0`);
    nk.sqlExec(`
      UPDATE tournaments t
      SET registered_count = COALESCE(sub.cnt, 0)
      FROM (
        SELECT tournament_id, COUNT(*)::int as cnt
        FROM tournament_participants
        GROUP BY tournament_id
      ) sub
      WHERE t.id = sub.tournament_id
    `);
    nk.sqlExec(`UPDATE tournaments SET registered_count = 0 WHERE registered_count IS NULL`);
    logger.info('Tournament series config ensured');
  } catch (error) {
    logger.warn('Failed to ensure tournament series config: ' + error);
  }

  // Clear stale player game states on server restart (matches do not survive restarts)
  try {
    nk.sqlExec(`
      UPDATE storage
      SET value = jsonb_set(
        jsonb_set(value, '{phase}', '"idle"', true),
        '{updatedAt}',
        to_jsonb((EXTRACT(EPOCH FROM NOW()) * 1000)::bigint),
        true
      )
      WHERE collection = 'player_state'
        AND key = 'game_state'
        AND COALESCE(value->>'phase', '') <> 'idle'
    `);
    logger.info('Player game states reset to idle on startup');
  } catch (error) {
    logger.warn('Failed to reset player game states on startup: ' + error);
  }

  // Remove deprecated achievement data from storage and normalize related records.
  try {
    nk.sqlExec(`
      DELETE FROM storage
      WHERE collection = 'player_data'
        AND key IN ('achievements', 'achievement_unlocks')
    `);
    nk.sqlExec(`
      UPDATE storage
      SET value = jsonb_set(
        value,
        '{activities}',
        COALESCE(
          (
            SELECT jsonb_agg(activity)
            FROM jsonb_array_elements(COALESCE(value->'activities', '[]'::jsonb)) AS activity
            WHERE COALESCE(activity->>'type', '') <> 'achievement'
          ),
          '[]'::jsonb
        ),
        true
      )
      WHERE collection = 'player_data'
        AND key = 'recent_activity'
        AND jsonb_typeof(value) = 'object'
        AND jsonb_typeof(value->'activities') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(value->'activities', '[]'::jsonb)) AS activity
          WHERE COALESCE(activity->>'type', '') = 'achievement'
        )
    `);
    nk.sqlExec(`
      UPDATE storage
      SET value = value - 'achievementNotification'
      WHERE collection = 'settings'
        AND key = 'preferences'
        AND jsonb_typeof(value) = 'object'
        AND (value ? 'achievementNotification')
    `);
    nk.sqlExec(`
      DO $$
      BEGIN
        IF to_regclass('public.badges') IS NOT NULL THEN
          UPDATE badges
          SET category = 'special'
          WHERE category = 'achievement';
        END IF;
      END $$;
    `);
    logger.info('Deprecated achievement data cleanup completed');
  } catch (error) {
    logger.warn('Failed to clean deprecated achievement data: ' + error);
  }

  // Start rate limit cleanup every 5 minutes
  // Note: Nakama doesn't have setInterval, cleanup happens on check

  // Register RPCs - Health & Monitoring
  initializer.registerRpc('health_check', rpcHealthCheck);
  initializer.registerRpc('server_status', rpcServerStatus);
  initializer.registerRpc('online_stats', rpcGetOnlineStats);
  initializer.registerRpc('online_ping', rpcOnlinePing);

  // Register RPCs - Authentication & User
  initializer.registerRpc('telegram_auth', rpcTelegramAuth);
  initializer.registerRpc('get_profile', rpcGetProfile);
  initializer.registerRpc('get_detailed_profile', rpcGetDetailedProfile);
  initializer.registerRpc('get_match_history', rpcGetMatchHistory);

  // Register auth hooks
  initializer.registerBeforeAuthenticateCustom(beforeAuthenticateCustom);
  initializer.registerAfterAuthenticateCustom(afterAuthenticateCustom);

  // Register RPCs - Game Data
  initializer.registerRpc('get_categories', rpcGetCategories);
  initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);
  initializer.registerRpc('get_category_mmr', rpcGetCategoryMmr);
  initializer.registerRpc('get_question_stats', rpcGetQuestionStats);
  initializer.registerRpc('start_bot_match', rpcStartBotMatch);
  initializer.registerRpc('start_practice_match', rpcStartPracticeMatch);

  // Register RPCs - Friends System (with rate limiting for abuse-prone operations)
  initializer.registerRpc('get_friends', rpcGetFriends);
  initializer.registerRpc('get_friend_requests', rpcGetFriendRequests);
  initializer.registerRpc('get_friend_activity', rpcGetFriendActivity);
  initializer.registerRpc('search_users', rpcSearchUsersRateLimited);
  initializer.registerRpc('send_friend_request', rpcSendFriendRequestRateLimited);
  initializer.registerRpc('accept_friend_request', rpcAcceptFriendRequest);
  initializer.registerRpc('reject_friend_request', rpcRejectFriendRequest);
  initializer.registerRpc('remove_friend', rpcRemoveFriend);
  initializer.registerRpc('challenge_friend', rpcChallengeFriendRateLimited);
  initializer.registerRpc('block_user', rpcBlockUserRateLimited);

  // Register RPCs - Profile Management
  initializer.registerRpc('update_profile', rpcUpdateProfile);
  if (ctx.env['ALLOW_QUESTION_PREVIEW'] === 'true') {
    initializer.registerRpc('get_questions', rpcGetQuestions);
    logger.info('Question preview RPC enabled');
  } else {
    logger.info('Question preview RPC disabled');
  }

  // Register RPCs - Admin Panel
  initializer.registerRpc('admin_authenticate', rpcAdminAuthenticate);
  initializer.registerRpc('admin_verify_session', rpcAdminVerifySession);
  initializer.registerRpc('admin_get_preferences', rpcAdminGetPreferences);
  initializer.registerRpc('admin_update_preferences', rpcAdminUpdatePreferences);
  initializer.registerRpc('admin_upsert_saved_view', rpcAdminUpsertSavedView);
  initializer.registerRpc('admin_delete_saved_view', rpcAdminDeleteSavedView);
  initializer.registerRpc('admin_get_dashboard_snapshot', rpcAdminGetDashboardSnapshot);
  initializer.registerRpc('admin_get_jobs_snapshot', rpcAdminGetJobsSnapshot);
  initializer.registerRpc('admin_get_dashboard_stats', rpcAdminGetDashboardStats);
  initializer.registerRpc('admin_get_activity_chart', rpcAdminGetActivityChart);
  initializer.registerRpc('admin_list_questions', rpcAdminListQuestions);
  initializer.registerRpc('admin_get_question', rpcAdminGetQuestion);
  initializer.registerRpc('admin_create_question', rpcAdminCreateQuestion);
  initializer.registerRpc('admin_update_question', rpcAdminUpdateQuestion);
  initializer.registerRpc('admin_delete_question', rpcAdminDeleteQuestion);
  initializer.registerRpc('admin_bulk_delete_questions', rpcAdminBulkDeleteQuestions);
  initializer.registerRpc('admin_toggle_question', rpcAdminToggleQuestion);
  initializer.registerRpc('admin_bulk_import_questions', rpcAdminBulkImportQuestions);
  initializer.registerRpc('admin_export_questions', rpcAdminExportQuestions);
  initializer.registerRpc('admin_refresh_question_cache', rpcAdminRefreshQuestionCache);
  initializer.registerRpc('admin_list_users', rpcAdminListUsers);
  initializer.registerRpc('admin_get_user', rpcAdminGetUser);
  initializer.registerRpc('admin_update_user_mmr', rpcAdminUpdateUserMmr);
  initializer.registerRpc('admin_start_ranked_reset', rpcAdminStartRankedReset);
  initializer.registerRpc('admin_continue_ranked_reset', rpcAdminContinueRankedReset);
  initializer.registerRpc('admin_get_ranked_reset_status', rpcAdminGetRankedResetStatus);
  initializer.registerRpc('admin_ban_user', rpcAdminBanUser);
  initializer.registerRpc('admin_unban_user', rpcAdminUnbanUser);
  initializer.registerRpc('admin_list_matches', rpcAdminListMatches);
  initializer.registerRpc('admin_get_match', rpcAdminGetMatch);
  initializer.registerRpc('admin_list_categories', rpcAdminListCategories);
  initializer.registerRpc('admin_create_category', rpcAdminCreateCategory);
  initializer.registerRpc('admin_update_category', rpcAdminUpdateCategory);
  initializer.registerRpc('admin_delete_category', rpcAdminDeleteCategory);
  initializer.registerRpc('admin_reorder_categories', rpcAdminReorderCategories);
  initializer.registerRpc('admin_list_bans', rpcAdminListBans);
  initializer.registerRpc('admin_get_ai_settings', rpcAdminGetAiSettings);
  initializer.registerRpc('admin_update_ai_settings', rpcAdminUpdateAiSettings);
  initializer.registerRpc('admin_toggle_ai_kill_switch', rpcAdminToggleAiKillSwitch);
  initializer.registerRpc('admin_upsert_ai_category_override', rpcAdminUpsertAiCategoryOverride);
  initializer.registerRpc('admin_delete_ai_category_override', rpcAdminDeleteAiCategoryOverride);
  initializer.registerRpc('admin_set_ai_provider_credential', rpcAdminSetAiProviderCredential);
  initializer.registerRpc('admin_list_ai_provider_profiles', rpcAdminListAiProviderProfiles);
  initializer.registerRpc('admin_create_ai_provider_profile', rpcAdminCreateAiProviderProfile);
  initializer.registerRpc('admin_update_ai_provider_profile', rpcAdminUpdateAiProviderProfile);
  initializer.registerRpc('admin_delete_ai_provider_profile', rpcAdminDeleteAiProviderProfile);
  initializer.registerRpc('admin_list_ai_source_packs', rpcAdminListAiSourcePacks);
  initializer.registerRpc('admin_create_ai_source_pack', rpcAdminCreateAiSourcePack);
  initializer.registerRpc('admin_update_ai_source_pack', rpcAdminUpdateAiSourcePack);
  initializer.registerRpc('admin_delete_ai_source_pack', rpcAdminDeleteAiSourcePack);
  initializer.registerRpc('admin_generate_ai_questions', rpcAdminGenerateAiQuestions);
  initializer.registerRpc('admin_list_ai_generation_jobs', rpcAdminListAiGenerationJobs);
  initializer.registerRpc('admin_get_ai_generation_job', rpcAdminGetAiGenerationJob);
  initializer.registerRpc('admin_list_ai_review_queue', rpcAdminListAiReviewQueue);
  initializer.registerRpc('admin_approve_ai_question', rpcAdminApproveAiQuestion);
  initializer.registerRpc('admin_reject_ai_question', rpcAdminRejectAiQuestion);
  initializer.registerRpc('admin_retry_ai_question', rpcAdminRetryAiQuestion);
  // Register RPCs - Rank Tiers
  initializer.registerRpc('get_rank_tiers', rpcGetRankTiers);
  initializer.registerRpc('admin_list_rank_tiers', rpcAdminListRankTiers);
  initializer.registerRpc('admin_create_rank_tier', rpcAdminCreateRankTier);
  initializer.registerRpc('admin_update_rank_tier', rpcAdminUpdateRankTier);
  initializer.registerRpc('admin_delete_rank_tier', rpcAdminDeleteRankTier);

  // Register RPCs - Home Page Control
  initializer.registerRpc('get_home_config', rpcGetHomeConfig);
  initializer.registerRpc('admin_list_banners', rpcAdminListBanners);
  initializer.registerRpc('admin_get_home_control_snapshot', rpcAdminGetHomeControlSnapshot);
  initializer.registerRpc('admin_create_banner', rpcAdminCreateBanner);
  initializer.registerRpc('admin_update_banner', rpcAdminUpdateBanner);
  initializer.registerRpc('admin_delete_banner', rpcAdminDeleteBanner);
  initializer.registerRpc('admin_list_home_sections', rpcAdminListHomeSections);
  initializer.registerRpc('admin_update_home_sections', rpcAdminUpdateHomeSections);
  initializer.registerRpc('admin_list_featured_items', rpcAdminListFeaturedItems);
  initializer.registerRpc('admin_set_featured_items', rpcAdminSetFeaturedItems);

  // Register RPCs - Audit Log
  initializer.registerRpc('admin_list_audit_logs', rpcAdminListAuditLogs);
  initializer.registerRpc('admin_get_audit_log', rpcAdminGetAuditLog);

  // Register RPCs - Game Settings
  initializer.registerRpc('get_game_settings', rpcGetGameSettings);
  initializer.registerRpc('admin_update_game_settings', rpcAdminUpdateGameSettings);

  logger.info('Admin panel RPCs registered');

  // Register RPCs - Seasons
  initializer.registerRpc('get_current_season', rpcGetCurrentSeason);
  initializer.registerRpc('get_season_leaderboard', rpcGetSeasonLeaderboard);
  initializer.registerRpc('admin_list_seasons', rpcAdminListSeasons);
  initializer.registerRpc('admin_create_season', rpcAdminCreateSeason);
  initializer.registerRpc('admin_end_season', rpcAdminEndSeason);

  // Register RPCs - Tournaments
  initializer.registerRpc('get_tournaments', rpcGetTournaments);
  initializer.registerRpc('get_tournament_details', rpcGetTournamentDetails);
  initializer.registerRpc('register_for_tournament', rpcRegisterForTournamentRateLimited);
  initializer.registerRpc('withdraw_from_tournament', rpcWithdrawFromTournament);
  initializer.registerRpc('withdraw_from_waitlist', rpcWithdrawFromWaitlist);
  initializer.registerRpc('get_my_tournaments', rpcGetMyTournaments);
  initializer.registerRpc('get_current_tournament_action', rpcGetCurrentTournamentAction);
  initializer.registerRpc('start_tournament_match', rpcStartTournamentMatchRateLimited);
  initializer.registerRpc('report_tournament_match_result', rpcReportTournamentMatchResult);
  initializer.registerRpc('admin_create_tournament', rpcAdminCreateTournament);
  initializer.registerRpc('admin_update_tournament', rpcAdminUpdateTournament);
  initializer.registerRpc('admin_start_tournament', rpcAdminStartTournament);
  initializer.registerRpc('admin_cancel_tournament', rpcAdminCancelTournament);
  initializer.registerRpc('admin_delete_tournament', rpcAdminDeleteTournament);
  initializer.registerRpc('admin_pause_tournament', rpcAdminPauseTournament);
  initializer.registerRpc('admin_resume_tournament', rpcAdminResumeTournament);
  initializer.registerRpc('admin_disqualify_participant', rpcAdminDisqualifyParticipant);
  initializer.registerRpc('admin_forfeit_participant', rpcAdminForfeitParticipant);
  initializer.registerRpc('admin_update_participant_seed', rpcAdminUpdateParticipantSeed);
  initializer.registerRpc('admin_shuffle_tournament_seeds', rpcAdminShuffleTournamentSeeds);
  initializer.registerRpc('admin_repair_tournament_best_of', rpcAdminRepairTournamentBestOf);
  initializer.registerRpc('admin_get_tournament_progress_snapshot', rpcAdminGetTournamentProgressSnapshot);

  // Register RPCs - Spectator
  initializer.registerRpc('get_spectator_matches', rpcGetSpectatorMatches);

  // Register RPCs - Notifications
  initializer.registerRpc('get_notifications', rpcGetNotifications);
  initializer.registerRpc('mark_notification_read', rpcMarkNotificationRead);
  initializer.registerRpc('register_push_token', rpcRegisterPushToken);
  initializer.registerRpc('get_notification_preferences', rpcGetNotificationPreferences);
  initializer.registerRpc('update_notification_preferences', rpcUpdateNotificationPreferences);

  // Register RPCs - Analytics
  initializer.registerRpc('admin_get_analytics_dashboard', rpcAdminGetAnalyticsDashboard);
  initializer.registerRpc('admin_get_user_engagement', rpcAdminGetUserEngagement);
  initializer.registerRpc('admin_get_question_analytics', rpcAdminGetQuestionAnalytics);
  initializer.registerRpc('admin_get_tournament_analytics', rpcAdminGetTournamentAnalytics);
  initializer.registerRpc('admin_get_retention_cohorts', rpcAdminGetRetentionCohorts);

  // Register RPCs - Donations
  initializer.registerRpc('initiate_donation', rpcInitiateDonation);
  initializer.registerRpc('confirm_donation', rpcConfirmDonation);
  initializer.registerRpc('get_donor_leaderboard', rpcGetDonorLeaderboard);
  initializer.registerRpc('admin_get_donation_stats', rpcAdminGetDonationStats);

  // Register RPCs - Telegram Stars Payments
  initializer.registerRpc('create_stars_invoice', rpcCreateStarsInvoiceRateLimited);
  initializer.registerRpc('confirm_stars_payment', rpcConfirmStarsPaymentRateLimited);

  // Register RPCs - Block System
  initializer.registerRpc('get_blocked_users', rpcGetBlockedUsers);
  initializer.registerRpc('unblock_user', rpcUnblockUser);

  // Register RPCs - Challenge System
  initializer.registerRpc('accept_challenge', rpcAcceptChallenge);
  initializer.registerRpc('decline_challenge', rpcDeclineChallenge);

  // Register RPCs - Web Authentication & Referral System
  initializer.registerRpc('telegram_web_login', rpcTelegramWebLogin);
  initializer.registerRpc('validate_referral_code', rpcValidateReferralCode);
  initializer.registerRpc('web_register', rpcWebRegister);
  initializer.registerRpc('web_login', rpcWebLogin);
  initializer.registerRpc('web_logout', rpcWebLogout);
  initializer.registerRpc('get_my_referral_code', rpcGetMyReferralCode);
  initializer.registerRpc('admin_create_referral_code', rpcAdminCreateReferralCode);
  initializer.registerRpc('admin_list_referral_codes', rpcAdminListReferralCodes);
  initializer.registerRpc('admin_toggle_referral_code', rpcAdminToggleReferralCode);
  initializer.registerRpc('admin_get_referral_code_usage', rpcAdminGetReferralCodeUsage);

  logger.info('Feature RPCs registered (config, seasons, tournaments, notifications, analytics, donations, payments, blocking, challenges, web-auth, referrals)');

  // Register matchmaker callback
  initializer.registerMatchmakerMatched(onMatchmakerMatched);

  // Register authoritative match handler
  initializer.registerMatch('quiz_match', {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });

  // Register RPCs - Tournament Experience
  initializer.registerRpc('tournament_ready_check', rpcTournamentReadyCheck);
  initializer.registerRpc('check_active_tournament_match', rpcCheckActiveTournamentMatch);

  // Scheduled job RPCs - call these from an external scheduler (cron, cloud functions, etc.)
  initializer.registerRpc('_cron_tournament_noshow_check', rpcCronTournamentNoshowCheck);
  initializer.registerRpc('_cron_tournament_reminders', rpcCronTournamentReminders);
  initializer.registerRpc('_cron_tournament_status_sync', rpcCronTournamentStatusSync);
  initializer.registerRpc('_cron_notification_cleanup', rpcCronNotificationCleanup);
  initializer.registerRpc('_cron_community_online_detector', rpcCronCommunityOnlineDetector);
  initializer.registerRpc('_cron_notification_campaign_dispatch', rpcCronNotificationCampaignDispatch);
  initializer.registerRpc('_cron_ai_generation_jobs', rpcCronAiGenerationJobs);

  logger.info('Tournament experience RPCs registered');
  logger.info('Beneficial Knowledge server initialized successfully');
};

var globalScope = (typeof globalThis !== 'undefined'
  ? globalThis
  : Function('return this')()) as unknown as { InitModule?: nkruntime.InitModule };
globalScope.InitModule = InitModule;
