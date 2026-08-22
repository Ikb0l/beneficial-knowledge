// BracketView - Main tournament bracket visualization component
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TournamentMatch, TournamentParticipant } from '../../stores/tournamentStore';
import { useBracketLayout } from '../../hooks/useBracketLayout';
import { BracketMatch } from './BracketMatch';
import { BracketConnectors } from './BracketConnector';
import { BracketListView } from './BracketListView';
import { cn } from '../../lib/utils/cn';

export interface BracketViewProps {
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

// Padding around the bracket
const BRACKET_PADDING = 40;
const BRACKET_PADDING_MOBILE = 24;

export function BracketView({
  matches,
  participants,
  format,
  currentUserId,
  isPaused,
  isCancelled,
  allowSpectators,
  onPlayMatch,
  onWatchMatch,
}: BracketViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const autoScrolledMatchIdRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Sync horizontal scroll between labels header and bracket content (two-way)
  const syncHorizontalScroll = (source: 'bracket' | 'labels') => {
    const container = containerRef.current;
    const labels = labelsRef.current;
    if (!container || !labels) return;

    if (source === 'bracket') {
      const target = container.scrollLeft;
      if (Math.abs(labels.scrollLeft - target) > 1) {
        labels.scrollLeft = target;
      }
    } else {
      const target = labels.scrollLeft;
      if (Math.abs(container.scrollLeft - target) > 1) {
        container.scrollLeft = target;
      }
    }
  };

  const handleBracketScroll = () => {
    syncHorizontalScroll('bracket');
  };

  const handleLabelsScroll = () => {
    syncHorizontalScroll('labels');
  };

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate bracket layout
  const {
    winnersLayout,
    losersLayout,
    grandFinalLayout,
    userPath,
    totalWidth,
    totalHeight,
  } = useBracketLayout(
    matches,
    participants,
    format,
    currentUserId,
    isMobile
  );

  // Get completed matches for winner path highlighting
  const completedMatches = useMemo(() => {
    const completed = new Set<string>();
    matches.forEach(m => {
      if (m.status === 'completed' || m.status === 'bye' || m.status === 'forfeit') {
        completed.add(m.id);
      }
    });
    return completed;
  }, [matches]);

  const userParticipantId = useMemo(() => {
    if (!currentUserId) return null;
    return participants.find((p) => p.userId === currentUserId)?.id || null;
  }, [participants, currentUserId]);

  const isUserMatchFor = (match: TournamentMatch): boolean => {
    if (!currentUserId) return false;
    if (userParticipantId && (match.player1Id === userParticipantId || match.player2Id === userParticipantId)) {
      return true;
    }
    const p1UserId = match.player1UserId || participants.find((p) => p.id === match.player1Id)?.userId;
    const p2UserId = match.player2UserId || participants.find((p) => p.id === match.player2Id)?.userId;
    return p1UserId === currentUserId || p2UserId === currentUserId;
  };

  // Find user's next match for "Jump to my match" button
  const userNextMatch = (() => {
    const userMatch = matches.find((m) => isUserMatchFor(m) && (m.status === 'ready' || m.status === 'in_progress'));

    if (userMatch) {
      // Find position
      const allPositions = [
        ...winnersLayout.positions,
        ...losersLayout.positions,
        ...grandFinalLayout.positions,
      ];
      return allPositions.find(p => p.matchId === userMatch.id);
    }
    return null;
  })();

  // Scroll to user's match (account for padding offset)
  const scrollToUserMatch = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (userNextMatch && containerRef.current) {
      const scrollPadding = isMobile ? BRACKET_PADDING_MOBILE : BRACKET_PADDING;
      const container = containerRef.current;
      containerRef.current.scrollTo({
        left: Math.max(0, userNextMatch.x + scrollPadding - (container.clientWidth / 2) + (userNextMatch.width / 2)),
        top: Math.max(0, userNextMatch.y + scrollPadding - (container.clientHeight / 2) + (userNextMatch.height / 2)),
        behavior,
      });
    }
  }, [isMobile, userNextMatch]);

  useEffect(() => {
    if (!userNextMatch || isMobile) return;
    if (autoScrolledMatchIdRef.current === userNextMatch.matchId) return;
    autoScrolledMatchIdRef.current = userNextMatch.matchId;

    const timer = window.setTimeout(() => {
      scrollToUserMatch('smooth');
    }, 150);

    return () => window.clearTimeout(timer);
  }, [isMobile, scrollToUserMatch, userNextMatch]);

  // All positions combined for SVG connectors
  const allPositions = [
    ...winnersLayout.positions,
    ...losersLayout.positions,
    ...grandFinalLayout.positions,
  ];

  const padding = isMobile ? BRACKET_PADDING_MOBILE : BRACKET_PADDING;
  const contentWidth = totalWidth + padding * 2;
  const contentHeight = totalHeight + padding * 2;

  // Determine if we need a losers bracket section label offset
  const losersBracketYOffset = winnersLayout.totalHeight + 48;

  // Mobile: render vertical list view instead of horizontal bracket
  if (isMobile) {
    return (
      <BracketListView
        matches={matches}
        participants={participants}
        format={format}
        currentUserId={currentUserId}
        isPaused={isPaused}
        isCancelled={isCancelled}
        allowSpectators={allowSpectators}
        onPlayMatch={onPlayMatch}
        onWatchMatch={onWatchMatch}
      />
    );
  }

  // Desktop: render horizontal bracket view
  return (
    <div className="relative">
      {/* Round labels header */}
      <div
        ref={labelsRef}
        onScroll={handleLabelsScroll}
        className="overflow-x-auto pb-2 mb-2 border-b border-white/10 scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-white/20"
        style={{ maxWidth: '100%' }}
      >
        <div
          className="relative flex gap-0"
          style={{
            width: contentWidth,
            paddingLeft: padding,
            paddingRight: padding,
          }}
        >
          {winnersLayout.roundLabels.map((label) => (
            <div
              key={`winners-label-${label.round}`}
              className="text-center"
              style={{
                position: 'absolute',
                left: label.x,
                transform: 'translateX(-50%)',
              }}
            >
              <span className="text-[10px] sm:text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                {label.label}
              </span>
            </div>
          ))}
          {grandFinalLayout.roundLabels.map((label) => (
            <div
              key={`gf-label-${label.round}`}
              className="text-center"
              style={{
                position: 'absolute',
                left: label.x,
                transform: 'translateX(-50%)',
              }}
            >
              <span className="text-[10px] sm:text-xs font-semibold text-yellow-400 uppercase tracking-wider whitespace-nowrap">
                {label.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable bracket container */}
      <div
        ref={containerRef}
        onScroll={handleBracketScroll}
        className={cn(
          'overflow-auto relative',
          'scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-white/20',
        )}
        style={{
          maxHeight: 'calc(var(--tg-viewport-stable-height) - 400px)',
          minHeight: '300px',
        }}
      >
        <div
          className="relative"
          style={{
            width: contentWidth,
            height: contentHeight,
            paddingLeft: padding,
            paddingTop: padding,
          }}
        >
          {/* SVG layer for connectors */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{
              width: contentWidth,
              height: contentHeight,
            }}
          >
            <g transform={`translate(${padding}, ${padding})`}>
              <BracketConnectors
                positions={allPositions}
                userPath={userPath}
                completedMatches={completedMatches}
              />
            </g>
          </svg>

          {/* Winners bracket */}
          {winnersLayout.positions.length > 0 && (
            <div className="relative">
              {format === 'double_elimination' && (
                  <div className="absolute -top-7 left-0 text-sm sm:text-base font-semibold text-text-secondary uppercase tracking-wider">
                  {t('tournaments.bracket.winners', 'Winners Bracket')}
                  </div>
              )}
              {winnersLayout.positions.map(pos => {
                const isUserMatch = isUserMatchFor(pos.match);

                return (
                  <div
                    key={pos.matchId}
                    className="absolute"
                    style={{
                      left: pos.x,
                      top: pos.y,
                    }}
                  >
                    <BracketMatch
                      match={pos.match}
                      participants={participants}
                      currentUserId={currentUserId}
                      isUserMatch={isUserMatch}
                      isUserPath={userPath.has(pos.matchId)}
                      isPaused={isPaused}
                      isCancelled={isCancelled}
                      allowSpectators={allowSpectators}
                      width={pos.width}
                      height={pos.height}
                      isMobile={isMobile}
                      onPlay={onPlayMatch}
                      onWatch={onWatchMatch}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Losers bracket (double elimination only) */}
          {losersLayout.positions.length > 0 && (
            <div className="relative">
              <div
                className="absolute left-0 text-sm sm:text-base font-semibold text-orange-400/80 uppercase tracking-wider"
                style={{ top: losersBracketYOffset - 28 }}
              >
                {t('tournaments.bracket.losers', 'Losers Bracket')}
              </div>
              {losersLayout.positions.map(pos => {
                const isUserMatch = isUserMatchFor(pos.match);

                return (
                  <div
                    key={pos.matchId}
                    className="absolute"
                    style={{
                      left: pos.x,
                      top: pos.y,
                    }}
                  >
                    <BracketMatch
                      match={pos.match}
                      participants={participants}
                      currentUserId={currentUserId}
                      isUserMatch={isUserMatch}
                      isUserPath={userPath.has(pos.matchId)}
                      isPaused={isPaused}
                      isCancelled={isCancelled}
                      allowSpectators={allowSpectators}
                      width={pos.width}
                      height={pos.height}
                      isMobile={isMobile}
                      onPlay={onPlayMatch}
                      onWatch={onWatchMatch}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Grand final */}
          {grandFinalLayout.positions.length > 0 && (
            <div className="relative">
              {grandFinalLayout.positions.map(pos => {
                const isUserMatch = isUserMatchFor(pos.match);

                return (
                  <div
                    key={pos.matchId}
                    className="absolute"
                    style={{
                      left: pos.x,
                      top: pos.y,
                    }}
                  >
                    <BracketMatch
                      match={pos.match}
                      participants={participants}
                      currentUserId={currentUserId}
                      isUserMatch={isUserMatch}
                      isUserPath={userPath.has(pos.matchId)}
                      isPaused={isPaused}
                      isCancelled={isCancelled}
                      allowSpectators={allowSpectators}
                      width={pos.width}
                      height={pos.height}
                      isMobile={isMobile}
                      onPlay={onPlayMatch}
                      onWatch={onWatchMatch}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Jump to my match button */}
      {userNextMatch && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => scrollToUserMatch('smooth')}
          className={cn(
            'fixed z-20',
            'flex items-center gap-1.5 rounded-full',
            'bg-accent-teal text-bg-primary font-semibold',
            'shadow-lg shadow-accent-teal/30',
            'hover:bg-accent-teal/90 active:scale-95 transition-all',
            isMobile
              ? 'bottom-20 right-3 px-3 py-2 text-xs'
              : 'bottom-24 right-4 px-4 py-2.5 text-sm',
          )}
        >
          <svg className={cn(isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {isMobile
            ? t('tournaments.bracket.myMatchShort', 'My Match')
            : t('tournaments.bracket.goToMyMatch', 'Go to My Match')}
        </motion.button>
      )}
    </div>
  );
}

export default BracketView;
