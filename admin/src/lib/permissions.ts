import type { AdminCapability, AdminRoleKey } from '../types';

export type RestrictedAction =
  | 'end_season'
  | 'delete_question'
  | 'adjust_mmr'
  | 'cancel_tournament'
  | 'start_tournament'
  | 'pause_tournament'
  | 'resume_tournament'
  | 'delete_tournament'
  | 'disqualify_participant'
  | 'forfeit_participant'
  | 'update_participant_seed'
  | 'shuffle_tournament_seeds'
  | 'repair_tournament_best_of'
  | 'reset_all_ranked_data'
  | 'ban_user'
  | 'unban_user';

export const ACTION_CAPABILITY_MAP: Record<RestrictedAction, AdminCapability> = {
  end_season: 'seasons.end',
  delete_question: 'questions.delete',
  adjust_mmr: 'users.adjust_mmr',
  cancel_tournament: 'tournaments.cancel',
  start_tournament: 'tournaments.start',
  pause_tournament: 'tournaments.pause',
  resume_tournament: 'tournaments.resume',
  delete_tournament: 'tournaments.delete',
  disqualify_participant: 'tournaments.manage_participants',
  forfeit_participant: 'tournaments.manage_participants',
  update_participant_seed: 'tournaments.manage_participants',
  shuffle_tournament_seeds: 'tournaments.shuffle_seeds',
  repair_tournament_best_of: 'tournaments.repair',
  reset_all_ranked_data: 'ranked.reset',
  ban_user: 'users.ban',
  unban_user: 'users.unban',
};

export const ADMIN_FEATURE_FLAGS = [
  'query_platform',
  'capability_session',
  'dashboard_snapshot',
  'home_control_snapshot',
  'jobs_snapshot',
] as const;

export const BASE_ADMIN_CAPABILITIES: AdminCapability[] = [
  'dashboard.view',
  'questions.view',
  'questions.create',
  'questions.update',
  'questions.import',
  'questions.export',
  'users.view',
  'matches.view',
  'categories.view',
  'categories.manage',
  'tournaments.view',
  'tournaments.create',
  'tournaments.update',
  'seasons.view',
  'seasons.create',
  'analytics.view',
  'home_control.view',
  'game_settings.view',
  'game_settings.update',
  'rank_tiers.view',
  'rank_tiers.manage',
  'referral_codes.view',
  'referral_codes.manage',
  'ai_questions.view',
  'ai_questions.manage',
  'audit.view',
];

export const SUPER_ADMIN_ONLY_CAPABILITIES: AdminCapability[] = [
  'questions.delete',
  'users.adjust_mmr',
  'users.ban',
  'users.unban',
  'tournaments.start',
  'tournaments.cancel',
  'tournaments.delete',
  'tournaments.pause',
  'tournaments.resume',
  'tournaments.manage_participants',
  'tournaments.shuffle_seeds',
  'tournaments.repair',
  'seasons.end',
  'ranked.reset',
];

export function getCapabilitiesForRole(roleKey: AdminRoleKey): AdminCapability[] {
  if (roleKey === 'super_admin') {
    return [...new Set([...BASE_ADMIN_CAPABILITIES, ...SUPER_ADMIN_ONLY_CAPABILITIES])];
  }
  return BASE_ADMIN_CAPABILITIES.slice();
}

export function hasCapability(capabilities: readonly string[] | undefined, capability: AdminCapability): boolean {
  if (!capabilities || capabilities.length === 0) return false;
  return capabilities.includes(capability);
}
