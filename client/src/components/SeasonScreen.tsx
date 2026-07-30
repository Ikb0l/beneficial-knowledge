// Season Screen - Current season leaderboard
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSeasonStore, type LeaderboardEntry } from '../stores/seasonStore';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils/cn';
import { Card, Avatar, Badge } from './ui';
import { screenVariants, containerVariants, itemVariants } from '../lib/animations/variants';

interface SeasonScreenProps {
  onBack: () => void;
}

function LeaderboardRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <motion.div
      variants={itemVariants}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl',
        isCurrentUser ? 'bg-accent-teal/20 border border-accent-teal/30' : 'bg-white/5'
      )}
    >
      {/* Rank */}
      <div className="w-10 text-center">
        {entry.rank <= 3 ? (
          <span className="text-2xl">{medals[entry.rank - 1]}</span>
        ) : (
          <span className="font-display text-lg font-bold text-text-secondary">
            {entry.rank}
          </span>
        )}
      </div>

      {/* Avatar */}
      <Avatar name={entry.displayName} size="sm" />

      {/* Player Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="name-text font-semibold text-white">
            {entry.displayName}
          </span>
          {isCurrentUser && (
            <Badge variant="primary" size="sm">You</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>{entry.gamesPlayed} games</span>
          <span>{entry.wins}W - {entry.losses}L</span>
        </div>
      </div>

      {/* MMR */}
      <div className="text-right">
        <span className="font-mono font-bold text-accent-teal">
          {entry.mmr.toLocaleString()}
        </span>
        <p className="text-xs text-text-secondary">
          Peak: {entry.peakMmr.toLocaleString()}
        </p>
      </div>
    </motion.div>
  );
}

export function SeasonScreen({ onBack }: SeasonScreenProps) {
  const { user } = useAuthStore();
  const {
    currentSeason,
    userRanking,
    leaderboard,
    isLoading,
    error,
    fetchCurrentSeason,
    fetchLeaderboard,
  } = useSeasonStore();
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    fetchCurrentSeason();
    fetchLeaderboard();
  }, [fetchCurrentSeason, fetchLeaderboard]);

  useEffect(() => {
    if (!currentSeason) {
      const resetTimer = setTimeout(() => setNowMs(null), 0);
      return () => clearTimeout(resetTimer);
    }
    const timer = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [currentSeason]);

  const daysRemaining = currentSeason && nowMs !== null
    ? Math.max(0, Math.ceil((new Date(currentSeason.endDate).getTime() - nowMs) / (1000 * 60 * 60 * 24)))
    : 0;

  const seasonProgress = currentSeason && nowMs !== null
    ? Math.min(100, Math.max(0,
        ((nowMs - new Date(currentSeason.startDate).getTime()) /
        (new Date(currentSeason.endDate).getTime() - new Date(currentSeason.startDate).getTime())) * 100
      ))
    : 0;

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="content-scrollable bg-gradient-main"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-display text-xl font-bold text-white">Season</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Error */}
        {error && (
          <Card variant="glass" className="bg-error/20 border-error/30 mb-4">
            <p className="text-error text-sm text-center">{error}</p>
          </Card>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-12 h-12 border-3 border-accent-teal border-t-transparent rounded-full"
            />
          </div>
        )}

        {!isLoading && currentSeason && (
          <>
            {/* Season Info Card */}
            <Card variant="gaming" padding="lg" className="mb-6">
              <div className="text-center mb-4">
                <span className="text-4xl mb-2 block">🌟</span>
                <h2 className="font-display text-2xl font-black text-white">
                  {currentSeason.name}
                </h2>
                <p className="text-text-secondary text-sm">
                  Season {currentSeason.seasonNumber}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>{new Date(currentSeason.startDate).toLocaleDateString()}</span>
                  <span>{new Date(currentSeason.endDate).toLocaleDateString()}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent-teal to-accent-purple rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${seasonProgress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-accent-teal">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-heading font-bold">
                  {daysRemaining} days remaining
                </span>
              </div>
            </Card>

            {/* User's Ranking */}
            {userRanking && (
              <Card variant="glass" className="mb-6">
                <div className="p-4">
                  <h3 className="font-heading font-semibold text-white mb-3">Your Season Stats</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-2xl font-display font-black text-accent-teal">
                        #{userRanking.rank || '—'}
                      </p>
                      <p className="text-xs text-text-secondary">Rank</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-2xl font-display font-black text-white">
                        {userRanking.mmr.toLocaleString()}
                      </p>
                      <p className="text-xs text-text-secondary">MMR</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-2xl font-display font-black text-green-400">
                        {userRanking.wins}
                      </p>
                      <p className="text-xs text-text-secondary">Wins</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-2xl font-display font-black text-white">
                        {userRanking.gamesPlayed}
                      </p>
                      <p className="text-xs text-text-secondary">Games</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Season Finale Info */}
            <Card variant="glass" className="mb-6">
              <div className="p-4">
                <h3 className="font-heading font-semibold text-white mb-3">Season Finale</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 bg-yellow-500/10 rounded-lg">
                    <span className="text-2xl">🥇</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-400">Top 1</p>
                      <p className="text-xs text-text-secondary">Crowned season champion</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-slate-400/10 rounded-lg">
                    <span className="text-2xl">🥈</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-300">Top 2-3</p>
                      <p className="text-xs text-text-secondary">Elite final placement</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-orange-500/10 rounded-lg">
                    <span className="text-2xl">🥉</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-400">Top 10</p>
                      <p className="text-xs text-text-secondary">High leaderboard finish</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                    <span className="text-2xl">🎖️</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">Top 100</p>
                      <p className="text-xs text-text-secondary">Recognized season participant</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Leaderboard */}
            <h2 className="font-heading font-semibold text-lg text-white mb-3">
              Season Leaderboard
            </h2>

            {leaderboard.length > 0 ? (
              <motion.div
                variants={containerVariants}
                initial="initial"
                animate="animate"
                className="flex flex-col gap-2"
              >
                {leaderboard.map((entry) => (
                  <LeaderboardRow
                    key={entry.userId}
                    entry={entry}
                    isCurrentUser={entry.userId === user?.userId}
                  />
                ))}
              </motion.div>
            ) : (
              <Card variant="glass" className="text-center py-8">
                <span className="text-4xl mb-3 block">📊</span>
                <p className="text-text-secondary">No rankings yet this season</p>
              </Card>
            )}
          </>
        )}

        {/* No Season */}
        {!isLoading && !currentSeason && (
          <Card variant="glass" className="text-center py-12">
            <span className="text-5xl mb-4 block">🌟</span>
            <h3 className="font-heading font-bold text-lg text-white mb-2">
              No Active Season
            </h3>
            <p className="text-text-secondary text-sm">
              Check back later for the next season!
            </p>
          </Card>
        )}
      </div>
    </motion.div>
  );
}

export default SeasonScreen;
