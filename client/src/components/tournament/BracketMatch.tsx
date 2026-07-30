// BracketMatch - Compact match card for bracket visualization
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TournamentMatch, TournamentParticipant } from '../../stores/tournamentStore';
import { cn } from '../../lib/utils/cn';

export interface BracketMatchProps {
  match: TournamentMatch;
  participants: TournamentParticipant[];
  currentUserId: string | null;
  isUserMatch: boolean;
  isUserPath: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  allowSpectators: boolean;
  width: number;
  height: number;
  isMobile: boolean;
  onPlay: (matchId: string, opponentName: string, useReadyCheck: boolean) => void;
  onWatch: (nakamaMatchId: string) => void;
}

interface PlayerRowProps {
  participant: TournamentParticipant | null;
  score: number | null;
  isWinner: boolean;
  isCurrentUser: boolean;
  isBot?: boolean;
  seedNumber?: number;
  isBye?: boolean;
  isMobile: boolean;
  animateScore: boolean;
  translate: (key: string, fallback: string, options?: Record<string, string | number>) => string;
}

function PlayerRow({
  participant, score, isWinner, isCurrentUser, isBot,
  seedNumber, isBye, isMobile, animateScore, translate,
}: PlayerRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between transition-colors duration-150',
        isMobile ? 'px-2 py-1.5 min-h-[28px]' : 'px-3 py-2 min-h-[36px]',
        isWinner && 'bg-green-500/10',
        isCurrentUser && !isWinner && 'bg-accent-teal/10',
      )}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {seedNumber && !isMobile && (
          <span className="text-[10px] text-text-secondary/50 font-mono w-4 flex-shrink-0">#{seedNumber}</span>
        )}
        <span
          title={participant?.displayName || ''}
          className={cn(
            'font-medium truncate',
            isMobile ? 'text-xs' : 'text-sm',
            isWinner && 'text-green-400',
            isCurrentUser && 'text-accent-teal',
            !isWinner && !isCurrentUser && 'text-white/90',
            isBye && 'text-text-secondary/50 italic',
          )}
        >
          {participant?.displayName || (isBye ? translate('tournaments.bracket.bye', 'BYE') : translate('tournaments.playerTbd', 'TBD'))}
        </span>
        {isCurrentUser && (
          <span className={cn('bg-accent-teal/25 text-accent-teal rounded flex-shrink-0', isMobile ? 'text-[9px] px-1' : 'text-[10px] px-1.5')}>
            {translate('tournaments.bracket.you', 'You')}
          </span>
        )}
        {isBot && (
          <span className={cn('bg-indigo-500/15 text-indigo-300 rounded flex-shrink-0', isMobile ? 'text-[9px] px-1' : 'text-[10px] px-1.5')}>
            {translate('tournaments.participantStatus.bot', 'BOT')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {score !== null && (
          <motion.span
            className={cn('font-bold text-right tabular-nums', isMobile ? 'text-sm min-w-[20px]' : 'text-base min-w-[24px]', isWinner && 'text-green-400')}
            key={animateScore ? `${participant?.id}-${score}` : undefined}
            initial={animateScore ? { scale: 1.4, color: '#22d3ee' } : undefined}
            animate={{ scale: 1, color: isWinner ? '#4ade80' : '#fff' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {score}
          </motion.span>
        )}
        {isWinner && (
          <motion.svg
            className={cn('text-green-400 flex-shrink-0', isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4')}
            fill="currentColor" viewBox="0 0 20 20"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </motion.svg>
        )}
      </div>
    </div>
  );
}

export function BracketMatch({
  match, participants, currentUserId, isUserMatch, isUserPath,
  isPaused, isCancelled, allowSpectators, width, height, isMobile,
  onPlay, onWatch,
}: BracketMatchProps) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string, options?: Record<string, string | number>) =>
    t(key, { ...(options || {}), defaultValue: fallback });

  const p1 = participants.find(p => p.id === match.player1Id) || null;
  const p2 = participants.find(p => p.id === match.player2Id) || null;
  const p1UserId = match.player1UserId || p1?.userId || null;
  const p2UserId = match.player2UserId || p2?.userId || null;
  const winnerParticipantId = match.winnerId || null;

  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const isReady = match.status === 'ready';
  const isPending = match.status === 'pending';
  const isBye = match.status === 'bye';
  const isForfeit = match.status === 'forfeit';
  const isCurrentUserP1 = p1UserId === currentUserId;
  const isCurrentUserP2 = p2UserId === currentUserId;
  const bothAssigned = !!match.player1Id && !!match.player2Id;
  const matchHasBot = Boolean(match.player1IsBot || match.player2IsBot || p1?.isBot || p2?.isBot);
  const isOwnMatch = isUserMatch || isCurrentUserP1 || isCurrentUserP2;

  const canPlay = isUserMatch && bothAssigned && !isCancelled && (isLive || (isReady && !isPaused));
  const canWatch = allowSpectators && isLive && !!match.nakamaMatchId && !isCancelled && !isOwnMatch;

  const opponentName = isCurrentUserP1
    ? (p2?.displayName || tr('tournaments.opponent', 'Opponent'))
    : (p1?.displayName || tr('tournaments.opponent', 'Opponent'));

  const bestOf = match.bestOf || 1;
  const seriesInfo = bestOf > 1
    ? tr('tournaments.seriesLabel', 'Bo{{bestOf}} - {{wins1}}:{{wins2}}', { bestOf, wins1: match.seriesWinsPlayer1 || 0, wins2: match.seriesWinsPlayer2 || 0 })
    : null;

  const showStatusBar = isLive || canPlay || isBye || isForfeit || (seriesInfo && !isMobile);

  // Border style
  const borderClass = cn(
    isLive && 'border-yellow-500/60',
    canPlay && !isLive && 'border-accent-teal/60',
    isComplete && 'border-white/10',
    isPending && 'border-white/5',
    isBye && 'border-dashed border-white/20',
    isUserPath && !isLive && !canPlay && 'border-accent-teal/25',
    !isLive && !canPlay && !isComplete && !isPending && !isBye && !isUserPath && 'border-white/10',
  );

  const shadowClass = cn(
    isLive && 'shadow-[0_0_16px_rgba(234,179,8,0.2)]',
    canPlay && !isLive && 'shadow-[0_0_14px_rgba(0,212,170,0.2)]',
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      style={{ width, height }}
      className={cn(
        'rounded-lg border overflow-hidden flex flex-col bg-bg-secondary/80 backdrop-blur-sm',
        isMobile && 'rounded-md',
        borderClass, shadowClass,
        isPaused && 'opacity-60',
      )}
    >
      {/* Status bar */}
      {showStatusBar && (
        <div className={cn(
          'flex items-center justify-between font-medium',
          isMobile ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
          isLive && 'bg-yellow-500/15 text-yellow-400',
          canPlay && !isLive && 'bg-accent-teal/15 text-accent-teal',
          isBye && 'bg-slate-500/15 text-slate-400',
          isForfeit && 'bg-orange-500/15 text-orange-400',
        )}>
          <div className="flex items-center gap-1">
            {(isLive || (canPlay && !isLive)) && (
              <motion.span
                className={cn('rounded-full', isLive ? 'bg-yellow-400' : 'bg-accent-teal', isMobile ? 'w-1 h-1' : 'w-1.5 h-1.5')}
                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {isLive && <span>{tr('tournaments.matchStatus.live', 'LIVE')}</span>}
            {canPlay && !isLive && <span>{isMobile ? tr('tournaments.bracket.playShort', 'PLAY') : tr('tournaments.bracket.yourMatch', 'YOUR MATCH')}</span>}
            {isBye && <span>{tr('tournaments.bracket.bye', 'BYE')}</span>}
            {isForfeit && <span>{tr('tournaments.matchStatus.forfeitShort', 'FF')}</span>}
          </div>
          {seriesInfo && !isMobile && <span className="text-text-secondary/70">{seriesInfo}</span>}
        </div>
      )}

      {/* Players */}
      <div className="flex-1 flex flex-col divide-y divide-white/5">
        <PlayerRow participant={p1} score={match.player1Score} isWinner={winnerParticipantId === p1?.id && isComplete}
          isCurrentUser={isCurrentUserP1} isBot={Boolean(match.player1IsBot || p1?.isBot)}
          seedNumber={p1?.seedNumber} isBye={isBye && !p1} isMobile={isMobile} animateScore={isComplete} translate={tr} />
        <PlayerRow participant={p2} score={match.player2Score} isWinner={winnerParticipantId === p2?.id && isComplete}
          isCurrentUser={isCurrentUserP2} isBot={Boolean(match.player2IsBot || p2?.isBot)}
          seedNumber={p2?.seedNumber} isBye={isBye && !p2} isMobile={isMobile} animateScore={isComplete} translate={tr} />
      </div>

      {/* Action buttons */}
      {(canPlay || canWatch) && (
        <div className={cn('bg-black/20 flex gap-1.5', isMobile ? 'px-2 py-1.5' : 'px-2.5 py-2')}>
          {canPlay && (
            <motion.button
              onClick={() => onPlay(match.id, opponentName, isReady && !matchHasBot)}
              className={cn(
                'flex-1 font-semibold rounded flex items-center justify-center gap-1 min-h-[44px]',
                isMobile ? 'text-xs py-2 px-3' : 'text-sm py-2.5 px-4',
                isLive ? 'bg-yellow-500/20 text-yellow-400' : 'bg-accent-teal/20 text-accent-teal',
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {isLive ? tr('tournaments.actions.rejoin', 'Rejoin') : tr('tournaments.actions.playMatch', 'Play Match')}
            </motion.button>
          )}
          {canWatch && !canPlay && (
            <motion.button
              onClick={() => match.nakamaMatchId && onWatch(match.nakamaMatchId)}
              className={cn(
                'flex-1 font-semibold rounded bg-white/8 text-white/75 flex items-center justify-center gap-1 min-h-[44px]',
                isMobile ? 'text-xs py-2 px-3' : 'text-sm py-2.5 px-4',
              )}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.14)' }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {tr('tournaments.actions.watch', 'Watch')}
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default BracketMatch;
