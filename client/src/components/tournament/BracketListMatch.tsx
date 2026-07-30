// BracketListMatch - Detailed match card for mobile vertical list view
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TournamentMatch, TournamentParticipant } from '../../stores/tournamentStore';
import { cn } from '../../lib/utils/cn';

export interface BracketListMatchProps {
  match: TournamentMatch;
  participants: TournamentParticipant[];
  currentUserId: string | null;
  isUserMatch: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  allowSpectators: boolean;
  onPlay: (matchId: string, opponentName: string, useReadyCheck: boolean) => void;
  onWatch: (nakamaMatchId: string) => void;
}

type TranslateFn = (key: string, fallback: string, options?: Record<string, string | number>) => string;

function formatRelativeTime(dateString: string | null, tr: TranslateFn): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return tr('tournaments.time.now', 'now');
  if (diffMins < 60) return tr('tournaments.time.minutesAgo', '{{count}}m ago', { count: diffMins });
  if (diffHours < 24) return tr('tournaments.time.hoursAgo', '{{count}}h ago', { count: diffHours });
  return tr('tournaments.time.daysAgo', '{{count}}d ago', { count: diffDays });
}

interface PlayerRowProps {
  participant: TournamentParticipant | null;
  score: number | null;
  isWinner: boolean;
  isCurrentUser: boolean;
  isBot?: boolean;
  seedNumber?: number;
  isBye?: boolean;
  animateScore: boolean;
  translate: TranslateFn;
}

function PlayerRow({ participant, score, isWinner, isCurrentUser, isBot, seedNumber, isBye, animateScore, translate }: PlayerRowProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 transition-colors duration-150', isWinner && 'bg-green-500/10', isCurrentUser && !isWinner && 'bg-accent-teal/10')}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {seedNumber && <span className="text-xs text-text-secondary/50 font-mono flex-shrink-0">#{seedNumber}</span>}
        <span title={participant?.displayName || ''} className={cn('font-medium truncate text-sm', isWinner && 'text-green-400', isCurrentUser && 'text-accent-teal', !isWinner && !isCurrentUser && 'text-white/90', isBye && 'text-text-secondary/50 italic')}>
          {participant?.displayName || (isBye ? translate('tournaments.bracket.bye', 'BYE') : translate('tournaments.playerTbd', 'TBD'))}
        </span>
        {isCurrentUser && <span className="text-[10px] px-1.5 bg-accent-teal/25 text-accent-teal rounded flex-shrink-0">{translate('tournaments.bracket.you', 'You')}</span>}
        {isBot && <span className="text-[10px] px-1.5 bg-indigo-500/15 text-indigo-300 rounded flex-shrink-0">{translate('tournaments.participantStatus.bot', 'BOT')}</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {score !== null && (
          <motion.span
            className={cn('font-bold text-base min-w-[24px] text-right tabular-nums', isWinner && 'text-green-400')}
            key={animateScore ? `${participant?.id}-${score}` : undefined}
            initial={animateScore ? { scale: 1.5, color: '#22d3ee' } : undefined}
            animate={{ scale: 1, color: isWinner ? '#4ade80' : '#fff' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {score}
          </motion.span>
        )}
        {isWinner && (
          <motion.svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"
            initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </motion.svg>
        )}
      </div>
    </div>
  );
}

export function BracketListMatch({ match, participants, currentUserId, isUserMatch, isPaused, isCancelled, allowSpectators, onPlay, onWatch }: BracketListMatchProps) {
  const { t } = useTranslation();
  const tr: TranslateFn = (key, fallback, options) => t(key, { ...(options || {}), defaultValue: fallback });

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

  const getStatusLabel = () => {
    if (isLive) return tr('tournaments.matchStatus.live', 'LIVE');
    if (isReady) return tr('tournaments.matchStatus.ready', 'READY');
    if (isComplete) return tr('tournaments.matchStatus.completed', 'COMPLETED');
    if (isBye) return tr('tournaments.matchStatus.bye', 'BYE');
    if (isForfeit) return tr('tournaments.matchStatus.forfeit', 'FORFEIT');
    return tr('tournaments.matchStatus.pending', 'PENDING');
  };

  const timeInfo = isLive && match.startedAt
    ? tr('tournaments.matchStatus.started', 'Started {{time}}', { time: formatRelativeTime(match.startedAt, tr) })
    : isComplete && match.completedAt
    ? tr('tournaments.matchStatus.completedAt', 'Completed {{time}}', { time: formatRelativeTime(match.completedAt, tr) })
    : null;

  const borderClass = cn(
    isLive && 'border-yellow-500/60 shadow-[0_0_16px_rgba(234,179,8,0.18)]',
    isUserMatch && !isLive && 'border-accent-teal/60 shadow-[0_0_14px_rgba(0,212,170,0.18)]',
    isComplete && !isUserMatch && 'border-white/10',
    isPending && !isUserMatch && 'border-white/5',
    isBye && 'border-dashed border-white/20',
    !isLive && !isUserMatch && !isComplete && !isPending && !isBye && 'border-white/10',
    isPaused && 'opacity-60',
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn('rounded-lg border overflow-hidden bg-bg-secondary/80 backdrop-blur-sm', borderClass)}
    >
      {/* Status bar */}
      <div className={cn('flex items-center justify-between px-4 py-2 text-xs font-medium',
        isLive && 'bg-yellow-500/15 text-yellow-400',
        isReady && !isLive && 'bg-accent-teal/15 text-accent-teal',
        isComplete && 'bg-white/3 text-text-secondary/60',
        isPending && 'bg-white/3 text-text-secondary/60',
        isBye && 'bg-slate-500/15 text-slate-400',
        isForfeit && 'bg-orange-500/15 text-orange-400',
      )}>
        <div className="flex items-center gap-2">
          {(isLive || (isReady && !isLive)) && (
            <motion.span
              className={cn('w-2 h-2 rounded-full', isLive ? 'bg-yellow-400' : 'bg-accent-teal')}
              animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.15, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <span>{getStatusLabel()}</span>
        </div>
        <div className="flex items-center gap-3 text-text-secondary/70">
          {seriesInfo && <span>{seriesInfo}</span>}
          {timeInfo && <span>{timeInfo}</span>}
        </div>
      </div>

      {/* Players */}
      <div className="divide-y divide-white/5">
        <PlayerRow participant={p1} score={match.player1Score} isWinner={winnerParticipantId === p1?.id && isComplete}
          isCurrentUser={isCurrentUserP1} isBot={Boolean(match.player1IsBot || p1?.isBot)}
          seedNumber={p1?.seedNumber} isBye={isBye && !p1} animateScore={isComplete} translate={tr} />
        <PlayerRow participant={p2} score={match.player2Score} isWinner={winnerParticipantId === p2?.id && isComplete}
          isCurrentUser={isCurrentUserP2} isBot={Boolean(match.player2IsBot || p2?.isBot)}
          seedNumber={p2?.seedNumber} isBye={isBye && !p2} animateScore={isComplete} translate={tr} />
      </div>

      {/* Action buttons */}
      {(canPlay || canWatch) && (
        <div className="bg-black/20 px-4 py-3 flex gap-3">
          {canPlay && (
            <motion.button
              onClick={() => onPlay(match.id, opponentName, isReady && !matchHasBot)}
              className={cn('flex-1 font-semibold rounded-lg flex items-center justify-center gap-2 min-h-[48px] text-sm py-3 px-4',
                isLive ? 'bg-yellow-500/20 text-yellow-400' : 'bg-accent-teal/20 text-accent-teal')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {isLive ? tr('tournaments.actions.rejoin', 'Rejoin') : tr('tournaments.actions.playMatch', 'Play Match')}
            </motion.button>
          )}
          {canWatch && !canPlay && (
            <motion.button
              onClick={() => match.nakamaMatchId && onWatch(match.nakamaMatchId)}
              className="flex-1 font-semibold rounded-lg bg-white/8 text-white/75 flex items-center justify-center gap-2 min-h-[48px] text-sm py-3 px-4"
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.14)' }}
              whileTap={{ scale: 0.96 }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

export default BracketListMatch;
