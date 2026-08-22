import type { TFunction } from 'i18next';

export interface TournamentJoinErrorContext {
  participantStatus?: string | null;
  finalPlacement?: number | null;
  roundNumber?: number | null;
  totalPlayers?: number | null;
}

function getPlacementLabel(t: TFunction, context?: TournamentJoinErrorContext): string {
  const placement = context?.finalPlacement || null;
  const totalPlayers = context?.totalPlayers || null;

  if (!placement) {
    return '';
  }

  if (totalPlayers) {
    return t('tournaments.errors.placementOutOf', {
      placement,
      totalPlayers,
      defaultValue: '#{{placement}} of {{totalPlayers}}',
    });
  }

  return t('tournaments.errors.placementOnly', {
    placement,
    defaultValue: '#{{placement}}',
  });
}

function getInactiveTournamentMessage(
  status: string,
  t: TFunction,
  context?: TournamentJoinErrorContext
): string {
  const round = context?.roundNumber || null;
  const placementText = getPlacementLabel(t, context);

  if (status === 'forfeited') {
    if (placementText) {
      return t('tournaments.errors.forfeitedJoinPlacement', {
        placement: placementText,
        defaultValue: 'You forfeited this tournament and finished {{placement}}. Open results for details.',
      });
    }

    return t('tournaments.errors.forfeitedJoin', 'You forfeited this tournament. Open results for details.');
  }

  if (status === 'disqualified') {
    if (placementText) {
      return t('tournaments.errors.disqualifiedJoinPlacement', {
        placement: placementText,
        defaultValue: 'You were disqualified and finished {{placement}}. Open results for details.',
      });
    }

    return t('tournaments.errors.disqualifiedJoin', 'You were disqualified. Open results for details.');
  }

  if (round && placementText) {
    return t('tournaments.errors.eliminatedJoinRoundPlacement', {
      round,
      placement: placementText,
      defaultValue: 'You were eliminated in Round {{round}} and finished {{placement}}. Open results for the bracket.',
    });
  }

  if (round) {
    return t('tournaments.errors.eliminatedJoinRound', {
      round,
      defaultValue: 'You were eliminated in Round {{round}}. Open results for the bracket.',
    });
  }

  if (placementText) {
    return t('tournaments.errors.eliminatedJoinPlacement', {
      placement: placementText,
      defaultValue: 'You were eliminated and finished {{placement}}. Open results for the bracket.',
    });
  }

  return t('tournaments.errors.eliminatedJoin', 'You were eliminated from this tournament. Open results for the bracket.');
}

export function getTournamentJoinErrorMessage(
  error: unknown,
  t: TFunction,
  mode: 'play' | 'watch' = 'play',
  context?: TournamentJoinErrorContext
): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.toLowerCase();

  const inactiveStatus = String(context?.participantStatus || '').toLowerCase();
  if (inactiveStatus === 'eliminated' || inactiveStatus === 'forfeited' || inactiveStatus === 'disqualified') {
    return getInactiveTournamentMessage(inactiveStatus, t, context);
  }

  if (normalized.includes('eliminated')) {
    return getInactiveTournamentMessage('eliminated', t, context);
  }

  if (normalized.includes('forfeited') || normalized.includes('forfeit')) {
    return getInactiveTournamentMessage('forfeited', t, context);
  }

  if (normalized.includes('disqualified')) {
    return getInactiveTournamentMessage('disqualified', t, context);
  }

  if (normalized.includes('not found') || normalized.includes('match not found')) {
    return t(
      'tournaments.errors.matchEnded',
      'This match is no longer live. Open the tournament bracket for the latest result.'
    );
  }

  if (
    normalized.includes('closed') ||
    normalized.includes('ended') ||
    normalized.includes('completed') ||
    normalized.includes('not in progress')
  ) {
    return t(
      'tournaments.errors.matchClosed',
      'This match has already ended. The bracket will show the next available step.'
    );
  }

  if (normalized.includes('spectator') || normalized.includes('watch')) {
    return mode === 'watch'
      ? t('tournaments.errors.watchUnavailable', 'Spectating is not available for this match right now.')
      : t('tournaments.errors.playerJoinUnavailable', 'This match is not accepting player joins right now.');
  }

  if (
    normalized.includes('unauthorized') ||
    normalized.includes('permission') ||
    normalized.includes('participant') ||
    normalized.includes('not a player')
  ) {
    return mode === 'watch'
      ? t('tournaments.errors.watchPermission', 'You can only watch public live tournament matches.')
      : t('tournaments.errors.notParticipant', 'This is not your active tournament match.');
  }

  if (
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('socket') ||
    normalized.includes('connection')
  ) {
    return t('tournaments.errors.connection', 'Connection dropped while joining. Please try again.');
  }

  return mode === 'watch'
    ? t('tournaments.errors.watchFailedDetailed', 'Could not open the live view. Refresh the tournament and try again.')
    : t('tournaments.errors.joinFailedDetailed', 'Could not join the match. Refresh the tournament and try again.');
}
