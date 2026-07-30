// BracketListView - Mobile vertical list view for tournament brackets
import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TournamentMatch, TournamentParticipant } from '../../stores/tournamentStore';
import { BracketListMatch } from './BracketListMatch';
import { cn } from '../../lib/utils/cn';

export interface BracketListViewProps {
  matches: TournamentMatch[];
  participants: TournamentParticipant[];
  format: 'single_elimination' | 'double_elimination';
  currentUserId: string | null;
  isPaused: boolean;
  isCancelled: boolean;
  allowSpectators: boolean;
  onPlayMatch: (matchId: string, opponentName: string, useReadyCheck: boolean) => void;
  onWatchMatch: (nakamaMatchId: string) => void;
}

type BracketTab = 'winners' | 'losers';
type TranslateFn = (key: string, fallback: string, options?: Record<string, string | number>) => string;

// Get round label based on round number and total rounds
function getRoundLabel(round: number, totalRounds: number, bracketType: string, tr: TranslateFn): string {
  if (bracketType === 'grand_final') return tr('tournaments.bracket.grandFinal', 'Grand Final');

  const roundsFromFinal = totalRounds - round;

  if (roundsFromFinal === 0) return tr('tournaments.bracket.finals', 'Finals');
  if (roundsFromFinal === 1) return tr('tournaments.bracket.semifinals', 'Semifinals');
  if (roundsFromFinal === 2) return tr('tournaments.bracket.quarterfinals', 'Quarterfinals');
  return tr('tournaments.bracket.round', 'Round {{round}}', { round });
}

function computeBracketMaxRound(matches: TournamentMatch[], bracketType: 'winners' | 'losers'): number {
  const filtered = matches.filter((m) => {
    if (bracketType === 'losers') return m.bracketType === 'losers';
    return !m.bracketType || m.bracketType === 'winners';
  });
  if (filtered.length === 0) return 1;
  return Math.max(...filtered.map((m) => m.roundNumber || 1));
}

// Group matches by round
function groupMatchesByRound(matches: TournamentMatch[]): Map<number, TournamentMatch[]> {
  const grouped = new Map<number, TournamentMatch[]>();

  matches.forEach(match => {
    const round = match.roundNumber || 1;
    if (!grouped.has(round)) {
      grouped.set(round, []);
    }
    grouped.get(round)!.push(match);
  });

  // Sort matches within each round by match number
  grouped.forEach((roundMatches) => {
    roundMatches.sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
  });

  return grouped;
}

export function BracketListView({
  matches,
  participants,
  format,
  currentUserId,
  isPaused,
  isCancelled,
  allowSpectators,
  onPlayMatch,
  onWatchMatch,
}: BracketListViewProps) {
  const { t } = useTranslation();
  const tr: TranslateFn = (key, fallback, options) =>
    t(key, { ...(options || {}), defaultValue: fallback });
  const [activeTab, setActiveTab] = useState<BracketTab | null>(null);
  const isDoubleElim = format === 'double_elimination';

  // Separate matches by bracket type
  const { winnersMatches, losersMatches, grandFinalMatches } = useMemo(() => {
    const winners: TournamentMatch[] = [];
    const losers: TournamentMatch[] = [];
    const grandFinal: TournamentMatch[] = [];

    matches.forEach(match => {
      if (match.bracketType === 'losers') {
        losers.push(match);
      } else if (match.bracketType === 'grand_final') {
        grandFinal.push(match);
      } else {
        // winners bracket or no bracket type (single elim)
        winners.push(match);
      }
    });

    return {
      winnersMatches: winners,
      losersMatches: losers,
      grandFinalMatches: grandFinal,
    };
  }, [matches]);

  // Count live matches per bracket for tab badges
  const liveCounts = useMemo(() => {
    const winnersLive = winnersMatches.filter(m => m.status === 'in_progress').length +
      grandFinalMatches.filter(m => m.status === 'in_progress').length;
    const losersLive = losersMatches.filter(m => m.status === 'in_progress').length;
    return { winners: winnersLive, losers: losersLive };
  }, [winnersMatches, losersMatches, grandFinalMatches]);

  const userParticipantId = useMemo(() => {
    if (!currentUserId) return null;
    return participants.find((p) => p.userId === currentUserId)?.id || null;
  }, [participants, currentUserId]);

  const isUserMatch = useCallback((match: TournamentMatch) => {
    if (!currentUserId) return false;
    if (userParticipantId && (match.player1Id === userParticipantId || match.player2Id === userParticipantId)) {
      return true;
    }
    const p1UserId = match.player1UserId ||
      participants.find((p) => p.id === match.player1Id)?.userId;
    const p2UserId = match.player2UserId ||
      participants.find((p) => p.id === match.player2Id)?.userId;
    return p1UserId === currentUserId || p2UserId === currentUserId;
  }, [currentUserId, participants, userParticipantId]);

  // Find user's active matches (ready or in_progress)
  const userActiveMatches = useMemo(() => {
    return matches.filter((match) => isUserMatch(match) && (match.status === 'ready' || match.status === 'in_progress'));
  }, [matches, isUserMatch]);

  const activeUserTab: BracketTab = userActiveMatches[0]?.bracketType === 'losers' ? 'losers' : 'winners';
  const effectiveActiveTab = activeTab || activeUserTab;

  // Get matches for current tab
  const displayMatches = useMemo(() => {
    if (effectiveActiveTab === 'losers') {
      return losersMatches;
    }
    // Winners tab includes grand final matches
    return [...winnersMatches, ...grandFinalMatches];
  }, [effectiveActiveTab, winnersMatches, losersMatches, grandFinalMatches]);

  // Group by round
  const matchesByRound = useMemo(() => {
    return groupMatchesByRound(displayMatches);
  }, [displayMatches]);

  // Get total rounds for label calculation
  const totalRounds = useMemo(() => {
    if (displayMatches.length === 0) return 1;
    if (effectiveActiveTab === 'losers') {
      return computeBracketMaxRound(matches, 'losers');
    }
    return computeBracketMaxRound(matches, 'winners');
  }, [displayMatches, effectiveActiveTab, matches]);

  return (
    <div className="relative">
      {/* Tabs for double elimination */}
      {isDoubleElim && (
        <div className="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-sm pb-3 mb-4 border-b border-white/10">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('winners')}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
                'flex items-center justify-center gap-2',
                effectiveActiveTab === 'winners'
                  ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/50'
                  : 'bg-white/5 text-white/60 border border-transparent hover:bg-white/10',
              )}
            >
              {tr('tournaments.bracket.winners', 'Winners')}
              {liveCounts.winners > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-yellow-500/30 text-yellow-400 font-bold">
                  {liveCounts.winners}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('losers')}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
                'flex items-center justify-center gap-2',
                effectiveActiveTab === 'losers'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                  : 'bg-white/5 text-white/60 border border-transparent hover:bg-white/10',
              )}
            >
              {tr('tournaments.bracket.losers', 'Losers')}
              {liveCounts.losers > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-yellow-500/30 text-yellow-400 font-bold">
                  {liveCounts.losers}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Your Matches section - pinned at top */}
      <AnimatePresence>
        {userActiveMatches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-accent-teal" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <h3 className="text-sm font-semibold text-accent-teal uppercase tracking-wider">
                {tr('tournaments.bracket.yourMatches', 'Your Matches')}
              </h3>
            </div>
            <div className="space-y-3">
              {userActiveMatches.map(match => (
                <BracketListMatch
                  key={`user-${match.id}`}
                  match={match}
                  participants={participants}
                  currentUserId={currentUserId}
                  isUserMatch={true}
                  isPaused={isPaused}
                  isCancelled={isCancelled}
                  allowSpectators={allowSpectators}
                  onPlay={onPlayMatch}
                  onWatch={onWatchMatch}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rounds list */}
      <div className="space-y-6">
        {Array.from(matchesByRound.entries())
          .sort(([a], [b]) => a - b)
          .map(([round, roundMatches]) => {
            // Check if this round has any grand final matches
            const hasGrandFinal = roundMatches.some(m => m.bracketType === 'grand_final');
            const bracketType = hasGrandFinal ? 'grand_final' : (effectiveActiveTab === 'losers' ? 'losers' : 'winners');
            const roundLabel = getRoundLabel(round, totalRounds, bracketType, tr);

            return (
              <motion.div
                key={`round-${round}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: round * 0.05 }}
              >
                {/* Round header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className={cn(
                    'text-sm font-semibold uppercase tracking-wider',
                    hasGrandFinal ? 'text-yellow-400' : 'text-text-secondary',
                  )}>
                    {roundLabel}
                  </h3>
                  <span className="text-xs text-text-secondary/70">
                    {tr(
                      'tournaments.bracket.matchCount',
                      '{{count}} {{label}}',
                      {
                        count: roundMatches.length,
                        label: roundMatches.length === 1
                          ? tr('tournaments.bracket.matchSingular', 'match')
                          : tr('tournaments.bracket.matchPlural', 'matches'),
                      }
                    )}
                  </span>
                </div>

                {/* Matches in this round */}
                <div className="space-y-3">
                  {roundMatches.map(match => {
                    // Skip matches already shown in "Your Matches" section
                    const isActive = match.status === 'ready' || match.status === 'in_progress';
                    const showInRound = !(isUserMatch(match) && isActive);

                    if (!showInRound) {
                      // Show a placeholder reference to avoid confusion
                      return (
                        <div
                          key={match.id}
                          className="py-2 px-4 rounded-lg border border-accent-teal/30 border-dashed bg-accent-teal/5 text-accent-teal/70 text-sm"
                        >
                          {tr('tournaments.bracket.pinnedMatch', 'Your match is pinned above')}
                        </div>
                      );
                    }

                    return (
                      <BracketListMatch
                        key={match.id}
                        match={match}
                        participants={participants}
                        currentUserId={currentUserId}
                        isUserMatch={isUserMatch(match)}
                        isPaused={isPaused}
                        isCancelled={isCancelled}
                        allowSpectators={allowSpectators}
                        onPlay={onPlayMatch}
                        onWatch={onWatchMatch}
                      />
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
      </div>

      {/* Empty state */}
      {displayMatches.length === 0 && (
        <div className="py-12 text-center">
          <div className="text-text-secondary/50 text-sm">
            {tr('tournaments.bracket.noMatches', 'No matches in this bracket yet')}
          </div>
        </div>
      )}
    </div>
  );
}

export default BracketListView;
