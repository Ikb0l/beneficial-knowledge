import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button, Card, ProgressBar } from '../components/ui';
import {
  useGameStore,
  DISCONNECT_GRACE_MS,
  clearStoredMatch,
  loadStoredMatch,
  shouldSuppressTournamentRejoinPrompt,
  suppressTournamentRejoinPrompt,
} from '../stores/gameStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useTournamentStore } from '../stores/tournamentStore';
import { cn } from '../lib/utils/cn';
import { formatQuizDisplayName } from '../lib/utils/quizDisplayName';
import nakama from '../shared/lib/nakama';

export function ReconnectLeaveOverlay() {
  const { t } = useTranslation();
  const {
    phase,
    connectionState,
    manualReconnect,
    manualReconnectInProgress,
    manualReconnectError,
    lastDisconnectAt,
    matchId,
    lastMatchId,
    leftIntentionally,
    leavePromptOpen,
    closeLeavePrompt,
    confirmLeaveMatch,
    isSpectator,
  } = useGameStore();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const isMatchActive = ['matched', 'countdown', 'question', 'reveal'].includes(phase);
  const canManualReconnect = !!lastDisconnectAt &&
    !leftIntentionally &&
    !!(matchId || lastMatchId);
  const showDisconnectedPrompt = isMatchActive && connectionState === 'disconnected';
  const showReconnectInProgress = isMatchActive && manualReconnectInProgress;
  const isDisconnectMode = showDisconnectedPrompt || showReconnectInProgress;
  const showLeavePrompt = isMatchActive && leavePromptOpen && !isDisconnectMode;
  const shouldShow = isDisconnectMode || showLeavePrompt;

  useEffect(() => {
    if (!isDisconnectMode || !lastDisconnectAt) {
      const resetTimer = setTimeout(() => setRemainingMs(null), 0);
      return () => clearTimeout(resetTimer);
    }

    const updateRemaining = () => {
      setRemainingMs(DISCONNECT_GRACE_MS - (Date.now() - lastDisconnectAt));
    };

    const initialTimer = setTimeout(updateRemaining, 0);
    const interval = setInterval(updateRemaining, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isDisconnectMode, lastDisconnectAt]);

  if (!shouldShow) return null;

  const showGraceCountdown = isDisconnectMode && !!lastDisconnectAt;
  const clampedRemainingMs = remainingMs === null ? DISCONNECT_GRACE_MS : Math.max(0, remainingMs);
  const remainingSeconds = Math.ceil(clampedRemainingMs / 1000);
  const timeExpired = showGraceCountdown && remainingMs !== null && remainingMs <= 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const reconnectDisabled = manualReconnectInProgress || (isDisconnectMode && (!canManualReconnect || timeExpired));
  const dialogTitle = isDisconnectMode
    ? t('overlay.connectionLostTitle')
    : (isSpectator ? t('overlay.leaveMatchTitle') : t('overlay.surrenderMatchTitle'));
  const dialogMessage = isDisconnectMode
    ? (isSpectator
      ? t('overlay.reconnectSpectatorMessage')
      : t('overlay.reconnectPlayerMessage'))
    : (isSpectator
      ? t('overlay.leaveSpectatorMessage')
      : t('overlay.surrenderPlayerMessage'));
  const primaryButtonText = isDisconnectMode
    ? t('overlay.reconnect')
    : t('overlay.returnToMatch');
  const leaveButtonText = isSpectator ? t('game.leave') : t('game.surrender');

  const handleReconnect = () => {
    if (isDisconnectMode) {
      if (reconnectDisabled) return;
      void manualReconnect();
      return;
    }
    closeLeavePrompt();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <Card variant="gaming" padding="md" className="w-full max-w-sm sm:max-w-md lg:max-w-lg border border-white/10">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
            <svg className="w-7 h-7 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-heading text-lg font-bold text-white">
              {dialogTitle}
            </h3>
            <p className="text-sm text-text-secondary">
              {dialogMessage}
            </p>
          </div>

          {showGraceCountdown && (
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>{t('overlay.gracePeriod')}</span>
                <span className={timeExpired ? 'text-feedback-wrong' : 'text-warning'}>
                  {timeLabel}
                </span>
              </div>
              <ProgressBar
                value={clampedRemainingMs}
                max={DISCONNECT_GRACE_MS}
                variant={timeExpired ? 'error' : 'warning'}
                size="sm"
                animated
              />
            </div>
          )}

          {isDisconnectMode && manualReconnectError && (
            <p className="text-sm text-feedback-wrong">{manualReconnectError}</p>
          )}

          {isDisconnectMode && !manualReconnectError && !canManualReconnect && (
            <p className="text-xs text-text-secondary">
              {isSpectator ? t('overlay.reconnectUnavailableSpectator') : t('overlay.reconnectUnavailablePlayer')}
            </p>
          )}

          {isDisconnectMode && timeExpired && !isSpectator && (
            <p className="text-xs text-feedback-wrong">
              {t('overlay.graceExpired')}
            </p>
          )}

          <div className="w-full space-y-2">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={manualReconnectInProgress}
              disabled={reconnectDisabled}
              onClick={handleReconnect}
            >
              {primaryButtonText}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={confirmLeaveMatch}
            >
              {leaveButtonText}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Ready Check Overlay - shows when tournament match ready check is in progress
export function ReadyCheckOverlay() {
  const { t } = useTranslation();
  const { readyCheck, confirmReady, cancelReadyCheck, startTournamentMatch, error: storeError, actionError } = useTournamentStore();
  const { joinDirectMatch } = useGameStore();
  const phase = useGameStore((state) => state.phase);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [matchStartError, setMatchStartError] = useState<string | null>(null);
  const startAttemptedForKeyRef = useRef<string | null>(null);
  const isStartingRef = useRef(false);

  const readyCheckKey = readyCheck
    ? `${readyCheck.tournamentId}:${readyCheck.matchId}`
    : null;

  // Update remaining time
  useEffect(() => {
    if (!readyCheck) {
      setRemainingMs(0);
      return;
    }

    const update = () => {
      const elapsed = Date.now() - readyCheck.startedAt;
      const remaining = Math.max(0, readyCheck.timeoutMs - elapsed);
      setRemainingMs(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [readyCheck]);

  useEffect(() => {
    if (!readyCheckKey) {
      startAttemptedForKeyRef.current = null;
      isStartingRef.current = false;
      return;
    }
    // New ready-check session -> allow one fresh auto-start attempt.
    startAttemptedForKeyRef.current = null;
    isStartingRef.current = false;
  }, [readyCheckKey]);

  // Server-authoritative ready-check can return the runtime match immediately.
  useEffect(() => {
    if (!readyCheck?.nakamaMatchId) return;
    if (!['idle', 'selecting'].includes(phase)) return;
    if (isStartingRef.current) return;

    isStartingRef.current = true;
    void (async () => {
      try {
        await joinDirectMatch(readyCheck.nakamaMatchId!);
        cancelReadyCheck(true);
      } catch (error) {
        console.error('Failed to join tournament match:', error);
        setMatchStartError(error instanceof Error ? error.message : t('overlay.failedStartMatch'));
      } finally {
        isStartingRef.current = false;
      }
    })();
  }, [readyCheck?.nakamaMatchId, phase, joinDirectMatch, cancelReadyCheck, t]);

  // Countdown when both players are ready
  useEffect(() => {
    if (!readyCheck || !readyCheck.userReady || !readyCheck.opponentReady) {
      setCountdown(null);
      return;
    }

    // Both players ready - start 3 second countdown
    setCountdown(3);
    setMatchStartError(null); // Clear any previous errors
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          return null;
        }
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [readyCheck, readyCheckKey, readyCheck?.userReady, readyCheck?.opponentReady]);

  // Start the match only after countdown reaches zero.
  useEffect(() => {
    if (!readyCheck || countdown !== 0) return;
    if (!readyCheckKey) return;
    if (isStartingRef.current) return;
    if (startAttemptedForKeyRef.current === readyCheckKey) return;

    startAttemptedForKeyRef.current = readyCheckKey;
    isStartingRef.current = true;

    void (async () => {
      try {
        const nakamaMatchId = await startTournamentMatch(readyCheck.tournamentId, readyCheck.matchId);
        if (nakamaMatchId) {
          await joinDirectMatch(nakamaMatchId);
          // Only close ready check locally after successful match join.
          cancelReadyCheck(true);
          return;
        }
        setMatchStartError(t('overlay.failedCreateMatch'));
      } catch (error) {
        console.error('Failed to start/join tournament match:', error);
        setMatchStartError(error instanceof Error ? error.message : t('overlay.failedStartMatch'));
      } finally {
        isStartingRef.current = false;
        setCountdown(null);
      }
    })();
  }, [readyCheck, readyCheckKey, countdown, startTournamentMatch, joinDirectMatch, cancelReadyCheck, t]);

  // Handle timeout
  useEffect(() => {
    if (!readyCheck) return;
    const elapsed = Date.now() - readyCheck.startedAt;
    if (elapsed >= readyCheck.timeoutMs) {
      // Local timeout should not clear server readiness. The server no-show
      // job uses ready_at to advance/forfeit stale matches authoritatively.
      cancelReadyCheck(true);
    }
  }, [readyCheck, remainingMs, cancelReadyCheck]);

  // Fallback: if opponent-ready notification is missed but match started, auto-join
  useEffect(() => {
    if (!readyCheck || !readyCheck.userReady || readyCheck.opponentReady) return;
    if (!['idle', 'selecting'].includes(phase)) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const data = await nakama.rpc<{
          hasActiveMatch: boolean;
          matchId?: string;
          nakamaMatchId?: string;
        }>('check_active_tournament_match', {});

        if (
          data.hasActiveMatch &&
          data.matchId === readyCheck.matchId &&
          data.nakamaMatchId &&
          !String(data.nakamaMatchId).startsWith('__starting__:')
        ) {
          await joinDirectMatch(data.nakamaMatchId);
          cancelReadyCheck(true);
        }
      } catch {
        // Ignore polling errors
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [readyCheck, readyCheck?.userReady, readyCheck?.opponentReady, phase, joinDirectMatch, cancelReadyCheck]);

  const handleConfirmReady = async () => {
    setIsConfirming(true);
    try {
      await confirmReady();
    } finally {
      setIsConfirming(false);
    }
  };

  if (!readyCheck) return null;

  const timeoutSeconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg"
      >
        <Card variant="gaming" padding="lg" className="border border-accent-teal/30">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Header */}
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold text-white">{t('overlay.readyCheckTitle')}</h2>
              <p className="text-sm text-text-secondary">
                {t('overlay.vsOpponent', { name: formatQuizDisplayName(readyCheck.opponentName, 'Player') })}
              </p>
            </div>

            {/* Countdown Display */}
            {countdown !== null ? (
              <motion.div
                key={countdown}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-full bg-green-500/30 border-4 border-green-500 flex items-center justify-center"
              >
                <span className="font-display text-4xl font-bold text-green-400">{countdown}</span>
              </motion.div>
            ) : (
              <div className="flex items-center gap-6">
                {/* User status */}
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center transition-all',
                    readyCheck.userReady
                      ? 'bg-green-500/30 border-2 border-green-500'
                      : 'bg-white/10 border-2 border-white/20'
                  )}>
                    {readyCheck.userReady ? (
                      <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-2xl">{String.fromCodePoint(0x1F3AE)}</span>
                    )}
                  </div>
                  <span className="text-xs text-text-secondary">{t('overlay.you')}</span>
                </div>

                {/* VS */}
                <span className="text-xl font-bold text-text-secondary">{t('countdown.vs')}</span>

                {/* Opponent status */}
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center transition-all',
                    readyCheck.opponentReady
                      ? 'bg-green-500/30 border-2 border-green-500'
                      : 'bg-white/10 border-2 border-white/20'
                  )}>
                    {readyCheck.opponentReady ? (
                      <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                      >
                        <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                  <span className="text-xs text-text-secondary">{t('overlay.opponent')}</span>
                </div>
              </div>
            )}

            {/* Error display */}
            {(matchStartError || actionError || storeError) && (
              <div className="w-full p-3 bg-red-500/20 rounded-lg border border-red-500/40">
                <p className="text-sm text-red-400 text-center">
                  {matchStartError || actionError || storeError}
                </p>
              </div>
            )}

            {/* Timeout display */}
            {countdown === null && !matchStartError && (
              <p className="text-sm text-text-secondary">
                {t('overlay.timeRemaining')} <span className="font-mono font-bold text-white">{timeoutSeconds}s</span>
              </p>
            )}

            {/* Action buttons */}
            {countdown === null && (
              <div className="w-full space-y-2">
                {!readyCheck.userReady ? (
                  <Button
                    variant="gaming"
                    size="lg"
                    fullWidth
                    loading={isConfirming}
                    onClick={handleConfirmReady}
                  >
                    {t('overlay.readyButton')}
                  </Button>
                ) : (
                  <div className="py-3 bg-green-500/20 rounded-lg text-center">
                    <span className="text-green-400 font-medium">
                      {readyCheck.opponentReady ? t('overlay.startingMatch') : t('overlay.waitingForOpponent')}
                    </span>
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => cancelReadyCheck(Boolean(readyCheck.nakamaMatchId))}
                >
                  {t('overlay.cancel')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// Active Match Popup - shows when app launches with an active tournament match
export function ActiveMatchPopup() {
  const { t } = useTranslation();
  const [activeMatch, setActiveMatch] = useState<{
    tournamentId: string;
    tournamentName: string;
    matchId: string;
    nakamaMatchId: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [isRejoining, setIsRejoining] = useState(false);
  const { joinDirectMatch } = useGameStore();
  const { phase } = useGameStore();

  // Check for active tournament match on mount
  useEffect(() => {
    const checkActiveMatch = async () => {
      try {
        const data = await nakama.rpc<{
          hasActiveMatch: boolean;
          tournamentId?: string;
          tournamentName?: string;
          matchId?: string;
          nakamaMatchId?: string;
        }>('check_active_tournament_match', {});

        if (
          data.hasActiveMatch &&
          data.nakamaMatchId &&
          !String(data.nakamaMatchId).startsWith('__starting__:')
        ) {
          if (shouldSuppressTournamentRejoinPrompt(data.matchId || null)) {
            return;
          }
          setRejoinError(null);
          setActiveMatch({
            tournamentId: data.tournamentId!,
            tournamentName: data.tournamentName!,
            matchId: data.matchId!,
            nakamaMatchId: data.nakamaMatchId,
          });
        }
      } catch (error) {
        console.error('Error checking for active tournament match:', error);
      }
    };

    checkActiveMatch();
  }, []);

  // Dismiss when entering a match
  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') return;
    const dismissTimer = setTimeout(() => setDismissed(true), 0);
    return () => clearTimeout(dismissTimer);
  }, [phase]);

  const handleRejoin = async () => {
    if (!activeMatch) return;
    setRejoinError(null);
    setIsRejoining(true);
    try {
      await joinDirectMatch(activeMatch.nakamaMatchId);
      setDismissed(true);
    } catch (error) {
      console.error('Error rejoining match:', error);
      setRejoinError(error instanceof Error ? error.message : 'Failed to rejoin match');
      suppressTournamentRejoinPrompt(activeMatch.matchId);
      clearStoredMatch();
      setActiveMatch(null);
      setDismissed(true);
    } finally {
      setIsRejoining(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (!activeMatch || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg"
      >
        <Card variant="gaming" padding="lg" className="border border-yellow-500/30">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-yellow-500/30 border-2 border-yellow-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Header */}
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white">{t('overlay.activeMatchFoundTitle')}</h2>
              <p className="text-sm text-text-secondary">
                {t('overlay.activeMatchInTournament')}
              </p>
              <p className="font-medium text-yellow-400">{activeMatch.tournamentName}</p>
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-2">
              <Button
                variant="gaming"
                size="lg"
                fullWidth
                disabled={isRejoining}
                onClick={handleRejoin}
              >
                {isRejoining ? 'Rejoining...' : t('overlay.rejoinMatch')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={handleDismiss}
              >
                {t('overlay.dismiss')}
              </Button>
              {rejoinError && (
                <p className="text-xs text-red-300">{rejoinError}</p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// Resume Match Popup - shows when app starts and a prior match is still stored
export function ResumeMatchPopup() {
  const { t } = useTranslation();
  const [storedMatch, setStoredMatch] = useState(() => loadStoredMatch());
  const [dismissed, setDismissed] = useState(false);
  const { joinDirectMatch } = useGameStore();
  const { phase } = useGameStore();
  const isSpectatorResume = (() => {
    const metadata = storedMatch?.metadata;
    if (!metadata || typeof metadata !== 'object') return false;
    const role = (metadata as { role?: unknown }).role;
    const spectator = (metadata as { spectator?: unknown }).spectator;
    return (
      role === 'spectator' ||
      spectator === true ||
      spectator === 'true' ||
      spectator === '1' ||
      spectator === 1
    );
  })();

  // Dismiss when entering a match
  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') return;
    const dismissTimer = setTimeout(() => setDismissed(true), 0);
    return () => clearTimeout(dismissTimer);
  }, [phase]);

  const handleRejoin = async () => {
    if (!storedMatch?.matchId) return;
    try {
      await joinDirectMatch(
        storedMatch.matchId,
        storedMatch.token || undefined,
        { spectator: isSpectatorResume }
      );
      setDismissed(true);
    } catch (error) {
      console.error('Error rejoining stored match:', error);
      clearStoredMatch();
      setStoredMatch(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    clearStoredMatch();
    setStoredMatch(null);
    setDismissed(true);
  };

  if (!storedMatch?.matchId || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg"
      >
        <Card variant="gaming" padding="lg" className="border border-cyan-500/30">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-cyan-500/30 border-2 border-cyan-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
              </svg>
            </div>

            {/* Header */}
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white">
                {isSpectatorResume ? t('overlay.resumeSpectatingTitle') : t('overlay.resumeMatchTitle')}
              </h2>
              <p className="text-sm text-text-secondary">
                {isSpectatorResume ? t('overlay.resumeSpectatingMessage') : t('overlay.resumeMatchMessage')}
              </p>
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-2">
              <Button
                variant="gaming"
                size="lg"
                fullWidth
                onClick={handleRejoin}
              >
                {isSpectatorResume ? t('overlay.resumeWatching') : t('overlay.rejoinMatch')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={handleDismiss}
              >
                {t('overlay.dismiss')}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// Toast notification container - shows real-time notifications
export function ToastContainer() {
  const { toasts, removeToast } = useNotificationStore();

  // Toast type colors
  const typeColors: Record<string, string> = {
    tournament_match_ready: 'bg-yellow-500/20 border-yellow-500/50',
    tournament_reminder_1h: 'bg-blue-500/20 border-blue-500/50',
    tournament_reminder_15m: 'bg-orange-500/20 border-orange-500/50',
    tournament_eliminated: 'bg-red-500/20 border-red-500/50',
    tournament_victory: 'bg-yellow-500/20 border-yellow-500/50',
    tournament_match_forfeit_win: 'bg-green-500/20 border-green-500/50',
    tournament_match_forfeit_loss: 'bg-red-500/20 border-red-500/50',
    tournament_ready_check: 'bg-teal-500/20 border-teal-500/50',
    friend_challenge: 'bg-orange-500/20 border-orange-500/50',
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'pointer-events-auto rounded-xl border backdrop-blur-lg p-4 shadow-lg',
              typeColors[toast.type] || 'bg-white/10 border-white/20'
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{toast.icon}</span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-white text-sm">{toast.title}</h4>
                {toast.body && (
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{toast.body}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

