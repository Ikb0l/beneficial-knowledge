// Challenge Modal - Accept/Decline friend challenges
import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Avatar, Button } from './ui';
import { GamepadIcon, SparklesIcon } from './ui/Icons';
import { useFriendsStore } from '../stores/friendsStore';
import { useCategoryStore } from '../stores/categoryStore';
import { gameSounds } from '../lib/audio';
import { useDialog } from '../hooks/useDialog';

interface ChallengeModalProps {
  onAccept: (matchId: string) => Promise<void>;
}

export function ChallengeModal({ onAccept }: ChallengeModalProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { pendingChallenge, acceptChallenge, declineChallenge, clearError } = useFriendsStore();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const categories = useCategoryStore((state) => state.categories);
  const fetchCategories = useCategoryStore((state) => state.fetchCategories);
  const categoriesLoading = useCategoryStore((state) => state.isLoading);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalTime, setTotalTime] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const progressPercent = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;

  // Calculate time remaining
  useEffect(() => {
    if (!pendingChallenge) return;

    const totalSeconds = Math.max(1, Math.ceil((pendingChallenge.expiresAt - Date.now()) / 1000));
    setTotalTime(totalSeconds);

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((pendingChallenge.expiresAt - Date.now()) / 1000));
      setTimeLeft(Math.min(remaining, totalSeconds));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    // Play notification sound
    gameSounds.onMatchFound();

    // Clear error when new challenge comes
    setError(null);
    clearError();

    return () => clearInterval(interval);
  }, [pendingChallenge, clearError]);

  useEffect(() => {
    if (!pendingChallenge || categories.length > 0 || categoriesLoading) return;
    fetchCategories();
  }, [pendingChallenge, categories.length, categoriesLoading, fetchCategories]);

  const categoryInfo = pendingChallenge?.category
    ? categories.find((category) => category.id === pendingChallenge.category)
    : null;
  const categoryLabel = categoryInfo?.name || pendingChallenge?.category;

  const handleAccept = async () => {
    setIsProcessing(true);
    setError(null);
    clearError();

    try {
      const matchId = await acceptChallenge();

      if (matchId) {
        await onAccept(matchId);
      } else {
        console.error('No matchId returned from acceptChallenge');
        const latestStoreError = useFriendsStore.getState().error || 'Failed to accept challenge';
        setError(latestStoreError);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Error accepting challenge:', err);
      setError(err instanceof Error ? err.message : 'Failed to join match');
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await declineChallenge();
    } finally {
      setIsProcessing(false);
    }
  };

  useDialog({
    open: !!pendingChallenge,
    onClose: () => {
      void handleDecline();
    },
    dialogRef,
    initialFocusRef: acceptButtonRef,
  });

  return (
    <AnimatePresence>
      {pendingChallenge && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm"
          role="presentation"
        >
          <motion.div
            className="fixed inset-0"
            onClick={handleDecline}
            aria-hidden="true"
          />

          <div className="relative z-10 flex min-h-full w-full items-center justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:py-6">
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="relative z-10 w-full max-w-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="overflow-hidden rounded-lg border border-white/15 bg-[#0b1730] shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
              <div className="flex h-1.5" aria-hidden="true">
                <span className="flex-1 bg-cyan-400" />
                <span className="flex-1 bg-violet-400" />
                <span className="flex-1 bg-amber-400" />
                <span className="flex-1 bg-rose-400" />
              </div>

              <div className="h-1 bg-white/10" aria-hidden="true">
                <motion.div
                  className={timeLeft <= 10 ? 'h-full bg-rose-400' : 'h-full bg-cyan-400'}
                  initial={{ width: '100%' }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 1, ease: 'linear' }}
                />
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-cyan-300/35 bg-cyan-400/10 p-1 shadow-[0_10px_24px_rgba(34,211,238,0.16)]">
                    <Avatar
                      src={pendingChallenge.fromAvatarUrl}
                      name={pendingChallenge.fromDisplayName}
                      size="lg"
                      showGlow={false}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-amber-200">
                      <SparklesIcon size={13} />
                      {t('challenge.incoming', 'Incoming challenge')}
                    </span>
                    <h2 id={titleId} className="mt-2 break-words font-display text-xl font-bold leading-tight text-white">
                      {pendingChallenge.fromDisplayName}
                    </h2>
                    <p className="mt-1 text-sm leading-snug text-slate-300">
                      {t('challenge.wants_to_play', 'wants to battle you!')}
                    </p>
                  </div>

                  <div className={timeLeft <= 10
                    ? 'min-w-16 rounded-lg border border-rose-300/35 bg-rose-400/10 px-2 py-2 text-center text-rose-200'
                    : 'min-w-16 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-2 py-2 text-center text-cyan-100'
                  }>
                    <span className="block font-mono text-xl font-black leading-none" aria-live="polite">{timeLeft}s</span>
                    <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.08em]">
                      {t('challenge.time_left', 'Time left')}
                    </span>
                  </div>
                </div>

                {categoryLabel && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-violet-300/25 bg-violet-400/10 p-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-300 text-[#151028] shadow-[0_8px_18px_rgba(196,181,253,0.2)]">
                      {categoryInfo?.icon ? <span className="text-xl" aria-hidden="true">{categoryInfo.icon}</span> : <GamepadIcon size={21} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-violet-200">
                        {t('challenge.category', 'Topic')}
                      </p>
                      <p className="mt-0.5 break-words text-sm font-bold leading-snug text-white">{categoryLabel}</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-3 rounded-lg border border-rose-300/35 bg-rose-400/10 p-3" role="alert" aria-live="polite">
                    <p className="text-sm text-rose-200">{error}</p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={handleDecline}
                    disabled={isProcessing}
                  >
                    {t('challenge.decline', 'Decline')}
                  </Button>
                  <Button
                    ref={acceptButtonRef}
                    variant="gaming"
                    size="lg"
                    fullWidth
                    onClick={handleAccept}
                    disabled={isProcessing}
                    pulsing={!reducedMotion}
                    leftIcon={!isProcessing ? <GamepadIcon size={19} /> : undefined}
                  >
                    {isProcessing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                    ) : (
                      t('challenge.accept', 'Accept')
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ChallengeModal;
