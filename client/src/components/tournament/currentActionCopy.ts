import type { TFunction } from 'i18next';
import type { CurrentTournamentAction } from '../../stores/tournamentStore';

export function getTournamentRoundLabel(action: CurrentTournamentAction, t: TFunction): string | null {
  const roundNumber = typeof action.roundNumber === 'number' ? action.roundNumber : null;
  const bracketType = String(action.bracketType || '');

  if (bracketType === 'grand_final') {
    return t('tournaments.roundContext.grandFinal', 'Grand Final');
  }

  if (!roundNumber) return null;

  if (bracketType === 'losers') {
    return t('tournaments.roundContext.losersRound', {
      round: roundNumber,
      defaultValue: 'Losers Round {{round}}',
    });
  }

  return t('tournaments.roundContext.round', {
    round: roundNumber,
    defaultValue: 'Round {{round}}',
  });
}

export function getTournamentCurrentActionLabel(action: CurrentTournamentAction, t: TFunction): string {
  const context = getTournamentRoundLabel(action, t);
  const opponent = action.opponentName || t('tournaments.opponent', 'Opponent');

  if (context) {
    if (action.kind === 'rejoin_match') {
      return t('tournaments.currentAction.rejoin_match.contextLabel', {
        context,
        opponent,
        defaultValue: '{{context}} - Rejoin vs {{opponent}}',
      });
    }
    if (action.kind === 'play_match') {
      return t('tournaments.currentAction.play_match.contextLabel', {
        context,
        opponent,
        defaultValue: '{{context}} - Play vs {{opponent}}',
      });
    }
    if (action.kind === 'ready_up') {
      return t('tournaments.currentAction.ready_up.contextLabel', {
        context,
        opponent,
        defaultValue: '{{context}} - Ready vs {{opponent}}',
      });
    }
    if (action.kind === 'waiting_for_opponent') {
      return t('tournaments.currentAction.waiting_for_opponent.contextLabel', {
        context,
        opponent,
        defaultValue: '{{context}} - Waiting for {{opponent}}',
      });
    }
  }

  return t(`tournaments.currentAction.${action.kind}.label`, action.label || action.kind.replace(/_/g, ' '));
}

export function getTournamentCurrentActionDescription(action: CurrentTournamentAction, t: TFunction): string {
  const context = getTournamentRoundLabel(action, t);
  const opponent = action.opponentName || t('tournaments.opponent', 'Opponent');

  if (
    context &&
    (action.kind === 'ready_up' ||
      action.kind === 'play_match' ||
      action.kind === 'rejoin_match' ||
      action.kind === 'waiting_for_opponent')
  ) {
    return t(`tournaments.currentAction.${action.kind}.contextDescription`, {
      context,
      opponent,
      defaultValue: '{{context}} against {{opponent}}.',
    });
  }

  return t(
    `tournaments.currentAction.${action.kind}.description`,
    'Open the tournament to see your bracket and next step.'
  );
}

export function getTournamentCurrentActionButtonLabel(action: CurrentTournamentAction, t: TFunction): string {
  return t(`tournaments.currentAction.${action.kind}.cta`, action.label || t('tournaments.actions.viewDetails', 'View Details'));
}
