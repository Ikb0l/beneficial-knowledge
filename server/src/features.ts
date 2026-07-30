import { rpcGetCurrentSeason, rpcGetSeasonLeaderboard, rpcAdminListSeasons, rpcAdminCreateSeason, rpcAdminEndSeason } from './features/seasons';
import { rpcGetTournaments, rpcGetTournamentDetails, rpcRegisterForTournament, rpcWithdrawFromTournament, rpcWithdrawFromWaitlist, rpcGetMyTournaments, rpcAdminCreateTournament, rpcAdminUpdateTournament, rpcAdminStartTournament, rpcAdminCancelTournament, rpcAdminDeleteTournament, rpcAdminPauseTournament, rpcAdminResumeTournament, rpcAdminDisqualifyParticipant, rpcAdminForfeitParticipant, rpcAdminUpdateParticipantSeed, rpcAdminShuffleTournamentSeeds, rpcAdminGetTournamentProgressSnapshot } from './features/tournaments';
import { rpcStartTournamentMatch, rpcReportTournamentMatchResult } from './features/tournament-matches';
import { rpcGetSpectatorMatches } from './features/spectator';
import { rpcTournamentReadyCheck, rpcCheckActiveTournamentMatch, tournamentExperienceHelpers } from './features/tournament-experience';
import { rpcGetNotifications, rpcMarkNotificationRead, rpcRegisterPushToken, rpcGetNotificationPreferences, rpcUpdateNotificationPreferences } from './features/notifications';
import { rpcAdminGetAnalyticsDashboard, rpcAdminGetUserEngagement, rpcAdminGetQuestionAnalytics, rpcAdminGetTournamentAnalytics, rpcAdminGetRetentionCohorts } from './features/analytics';
import { rpcGetBlockedUsers, rpcBlockUser, rpcUnblockUser } from './features/block';
import { rpcAcceptChallenge, rpcDeclineChallenge } from './features/challenges';
import { rpcInitiateDonation, rpcConfirmDonation, rpcGetDonorLeaderboard, rpcAdminGetDonationStats } from './features/donations';
import { rpcCreateStarsInvoice, rpcConfirmStarsPayment } from './features/telegram-stars';

// EXPORT ALL FEATURE RPCs
// ============================================================================

// This object will be used to register all RPCs in main.ts
export var FeatureRPCs = {
  // Seasons
  get_current_season: rpcGetCurrentSeason,
  get_season_leaderboard: rpcGetSeasonLeaderboard,
  admin_list_seasons: rpcAdminListSeasons,
  admin_create_season: rpcAdminCreateSeason,
  admin_end_season: rpcAdminEndSeason,

  // Tournaments
  get_tournaments: rpcGetTournaments,
  get_tournament_details: rpcGetTournamentDetails,
  register_for_tournament: rpcRegisterForTournament,
  withdraw_from_tournament: rpcWithdrawFromTournament,
  withdraw_from_waitlist: rpcWithdrawFromWaitlist,
  get_my_tournaments: rpcGetMyTournaments,
  admin_create_tournament: rpcAdminCreateTournament,
  admin_update_tournament: rpcAdminUpdateTournament,
  admin_start_tournament: rpcAdminStartTournament,
  admin_cancel_tournament: rpcAdminCancelTournament,
  admin_delete_tournament: rpcAdminDeleteTournament,
  admin_pause_tournament: rpcAdminPauseTournament,
  admin_resume_tournament: rpcAdminResumeTournament,
  admin_disqualify_participant: rpcAdminDisqualifyParticipant,
  admin_forfeit_participant: rpcAdminForfeitParticipant,
  admin_update_participant_seed: rpcAdminUpdateParticipantSeed,
  admin_shuffle_tournament_seeds: rpcAdminShuffleTournamentSeeds,
  admin_get_tournament_progress_snapshot: rpcAdminGetTournamentProgressSnapshot,

  // Tournament Matches
  start_tournament_match: rpcStartTournamentMatch,
  report_tournament_match_result: rpcReportTournamentMatchResult,

  // Spectator
  get_spectator_matches: rpcGetSpectatorMatches,

  // Tournament Experience (Ready Check, Active Match)
  tournament_ready_check: rpcTournamentReadyCheck,
  check_active_tournament_match: rpcCheckActiveTournamentMatch,

  // Notifications
  get_notifications: rpcGetNotifications,
  mark_notification_read: rpcMarkNotificationRead,
  register_push_token: rpcRegisterPushToken,
  get_notification_preferences: rpcGetNotificationPreferences,
  update_notification_preferences: rpcUpdateNotificationPreferences,

  // Analytics (Admin)
  admin_get_analytics_dashboard: rpcAdminGetAnalyticsDashboard,
  admin_get_user_engagement: rpcAdminGetUserEngagement,
  admin_get_question_analytics: rpcAdminGetQuestionAnalytics,
  admin_get_tournament_analytics: rpcAdminGetTournamentAnalytics,
  admin_get_retention_cohorts: rpcAdminGetRetentionCohorts,

  // Block System
  get_blocked_users: rpcGetBlockedUsers,
  block_user: rpcBlockUser,
  unblock_user: rpcUnblockUser,

  // Challenge System
  accept_challenge: rpcAcceptChallenge,
  decline_challenge: rpcDeclineChallenge,

  // Donations
  initiate_donation: rpcInitiateDonation,
  confirm_donation: rpcConfirmDonation,
  get_donor_leaderboard: rpcGetDonorLeaderboard,
  admin_get_donation_stats: rpcAdminGetDonationStats,

  // Telegram Stars Payments
  create_stars_invoice: rpcCreateStarsInvoice,
  confirm_stars_payment: rpcConfirmStarsPayment,

  // Tournament Experience Helpers (for use in main.ts cron jobs)
  _tournamentExperienceHelpers: tournamentExperienceHelpers,
};
