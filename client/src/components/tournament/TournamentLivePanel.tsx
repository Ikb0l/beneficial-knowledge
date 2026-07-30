import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SpectatorMatch } from '../../stores/tournamentStore';
import { Card, Button } from '../ui';
import { TournamentStatusBadge } from './TournamentStatusBadge';

interface TournamentLivePanelProps {
  matches: SpectatorMatch[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewTournament?: (tournamentId: string) => void;
  onWatchMatch: (nakamaMatchId: string) => void;
}

const getInitials = (name: string): string => {
  const safe = name.trim();
  if (!safe) return '??';
  const parts = safe.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return safe.slice(0, 2).toUpperCase();
};

const cardStagger = { delay: 0.04 };
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function TournamentLivePanel({ matches, isLoading, error, onRefresh, onViewTournament, onWatchMatch }: TournamentLivePanelProps) {
  const { t } = useTranslation();

  return (
    <Card variant="glass" className="overflow-hidden border border-white/[0.07] bg-[#0b1120]/90 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="relative border-b border-white/[0.06] bg-gradient-to-r from-[#0c1630]/95 via-[#101d44]/90 to-[#1a1248]/88 px-4 py-3.5 overflow-hidden">
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(105deg, transparent 0%, transparent 38%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.06) 48%, transparent 52%, transparent 100%)' }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
        />
        <div className="flex items-center justify-between gap-2 relative z-[1]">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-text-secondary/60">
              {t('tournaments.status.in_progress', 'Live')}
            </p>
            <h2 className="truncate text-lg font-heading font-bold text-white tracking-[-0.01em]">
              {t('tournaments.livePanel.title', 'Live Matches')}
            </h2>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
            {t('tournaments.actions.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="rounded-xl border border-red-400/25 bg-red-500/8 px-3 py-2 text-sm text-red-300"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
              className="h-8 w-8 rounded-full border-2 border-accent-teal/40 border-t-accent-teal shadow-[0_0_12px_rgba(0,212,170,0.2)]"
            />
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && matches.length === 0 && (
          <motion.div
            className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-8 text-center text-sm text-text-secondary/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {t('tournaments.livePanel.empty', 'No live matches right now')}
          </motion.div>
        )}

        {/* Match cards */}
        {!isLoading && (
          <motion.div className="space-y-2.5" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: cardStagger.delay } } }}>
            {matches.map((match) => (
              <motion.div key={match.matchId} variants={cardVariants}>
                <motion.div
                  className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/85 backdrop-blur-sm p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] relative overflow-hidden"
                  whileHover={{ scale: 1.005, borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  {/* Live breathing border glow */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    animate={{ boxShadow: [
                      'inset 0 0 0px rgba(234,179,8,0)',
                      'inset 0 0 8px rgba(234,179,8,0.08)',
                      'inset 0 0 0px rgba(234,179,8,0)',
                    ]}}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  <div className="mb-2.5 flex items-start justify-between gap-2 relative z-[1]">
                    <div className="min-w-0">
                      <p className="name-text truncate text-sm font-semibold text-white">{match.tournamentName}</p>
                      <p className="text-xs text-text-secondary/60">
                        {t('tournaments.livePanel.round', { round: match.roundNumber, defaultValue: 'Round {{round}}' })}
                      </p>
                    </div>
                    <TournamentStatusBadge status="in_progress" />
                  </div>

                  <div className="mb-3 space-y-2 relative z-[1]">
                    {[match.player1, match.player2].map((player, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[10px] font-bold text-white/70">
                          {getInitials(player?.name || t('tournaments.playerTbd', 'TBD'))}
                        </span>
                        <p className="name-text min-w-0 truncate text-sm text-white/90">
                          {player?.name || t('tournaments.playerTbd', 'TBD')}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3 text-xs text-text-secondary/50 relative z-[1]">
                    <motion.span
                      key={match.spectatorCount}
                      initial={{ scale: 1.2, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      {t('tournaments.livePanel.watching', { count: match.spectatorCount, defaultValue: '{{count}} watching' })}
                    </motion.span>
                  </div>

                  <div className="flex gap-2 relative z-[1]">
                    {onViewTournament && (
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => onViewTournament(match.tournamentId)}>
                        {t('tournaments.actions.view', 'View')}
                      </Button>
                    )}
                    {match.nakamaMatchId && (
                      <Button variant="gaming" size="sm" className="flex-1" onClick={() => onWatchMatch(match.nakamaMatchId!)}>
                        {t('tournaments.actions.watch', 'Watch')}
                      </Button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </Card>
  );
}

export default TournamentLivePanel;
