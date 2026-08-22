import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
// import { useCategoryStore } from '../../stores/categoryStore';
import { DEFAULT_MATCH_PACING, useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { GameMatchPacing, MmrChange, Player } from '../../stores/gameStore';
import {
  Avatar,
  Button,
  Card,
  Countdown,
  ReviewAnswersModal,
} from '../../components/ui';
import {
  CircularTimer,
  CountdownPulse,
  LightningStrike,
  PassageGameLayout,
  PassagePanel,
  QuestionRenderer,
  QuestionProgress,
  SideTimerRails,
  type SideTimerState,
  ScoreRoll,
} from '../../components/game';
import {
  avatarSwooshLeftVariants,
  avatarSwooshRightVariants,
  defeatVariants,
  scoreChangeVariants,
  screenVariants,
  victoryTextVariants,
  victoryVariants,
  vsVariants,
} from '../../lib/animations/variants';
import { cn } from '../../lib/utils/cn';
import { formatQuizDisplayName } from '../../lib/utils/quizDisplayName';
import { useViewportDensity } from '../../hooks/useViewportDensity';
import nakama from '../../shared/lib/nakama';

type DisplayPlayers = {
  left: Player | null;
  right: Player | null;
  leftIsUser: boolean;
  rightIsUser: boolean;
};

const getDisplayPlayers = (
  players: Player[],
  userId?: string | null,
  isSpectator?: boolean
): DisplayPlayers => {
  if (isSpectator || !userId) {
    return {
      left: players[0] || null,
      right: players[1] || null,
      leftIsUser: false,
      rightIsUser: false,
    };
  }
  const left = players.find(p => p.userId === userId) || players[0] || null;
  const right = players.find(p => p.userId !== (left?.userId || userId)) || players[1] || null;
  return {
    left,
    right,
    leftIsUser: !!left && left.userId === userId,
    rightIsUser: !!right && right.userId === userId,
  };
};

const clampProgress = (value: number): number => Math.max(0, Math.min(1, value));

const getTimerState = (timeLeft: number): SideTimerState => {
  if (timeLeft <= 3) return 'danger';
  if (timeLeft <= 5) return 'warning';
  return 'safe';
};

const getProgressTimerState = (progress: number): SideTimerState => {
  if (progress <= 0.33) return 'danger';
  if (progress <= 0.66) return 'warning';
  return 'safe';
};

const getLeadAvatarStates = (leftScore: number, rightScore: number, enabled: boolean): { left: 'winning' | 'losing' | 'idle'; right: 'winning' | 'losing' | 'idle' } => {
  if (!enabled || leftScore === rightScore) {
    return { left: 'idle', right: 'idle' };
  }
  return leftScore > rightScore
    ? { left: 'winning', right: 'losing' }
    : { left: 'losing', right: 'winning' };
};

const resolveDisplayedMmrChange = (change?: MmrChange | null): number | null => {
  if (!change) return null;
  if (typeof change.globalChange === 'number') return change.globalChange;
  if (typeof change.change === 'number') return change.change;
  if (typeof change.globalNewMmr === 'number' && typeof change.globalOldMmr === 'number') {
    return change.globalNewMmr - change.globalOldMmr;
  }
  if (typeof change.newMmr === 'number' && typeof change.oldMmr === 'number') {
    return change.newMmr - change.oldMmr;
  }
  return null;
};

const getRoundPulseTotalMs = (pacing: GameMatchPacing): number => {
  const total = pacing.roundPulseStartDelayMs + pacing.roundPulseCompleteDelayMs;
  return Math.max(1, total);
};

export function CountdownScreen() {
  const { t } = useTranslation();
  const { countdown, players, isSpectator, matchMode } = useGameStore();
  const { user } = useAuthStore();
  const { isCompact, isVeryCompact, isUltraCompact } = useViewportDensity();
  const sessionUserId = nakama.getSession()?.user_id || null;
  const currentUserId = sessionUserId || user?.userId || '';
  const { left, right, leftIsUser } = getDisplayPlayers(players, currentUserId, isSpectator);
  const isPracticeMatch = !isSpectator && matchMode === 'practice';
  const countValue = Number.isFinite(countdown) ? Math.max(0, Math.floor(countdown)) : 3;
  const leftName = leftIsUser
    ? formatQuizDisplayName(user?.displayName || t('countdown.you'), t('countdown.you'))
    : formatQuizDisplayName(left?.username, t('game.playerOne'));
  const rightName = isPracticeMatch
    ? t('search.modePractice', 'Practice')
    : formatQuizDisplayName(right?.username, t('game.playerTwo'));
  const leftAvatarUrl = leftIsUser ? user?.photoUrl : left?.avatarUrl;
  const rightAvatarUrl = right?.avatarUrl;
  const leftMmr = left?.mmr || (leftIsUser ? (user?.profile?.mmr || 1000) : 1000);
  const rightMmr = right?.mmr || 1000;
  const leftPlayerType = leftIsUser ? 'you' : 'neutral';
  const rightPlayerType = isPracticeMatch ? 'neutral' : (leftIsUser ? 'opponent' : 'neutral');
  const avatarSize = isUltraCompact ? 'xl' : isVeryCompact ? '2xl' : '3xl';

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-viewport flex flex-col items-center justify-center px-4 relative overflow-hidden no-x-overflow"
    >
      {/* Split Background Effect */}
      <div className="absolute inset-0 flex">
        <div className="w-1/2 bg-gradient-to-br from-accent-teal/10 to-transparent" />
        <div className="w-1/2 bg-gradient-to-bl from-accent-orange/10 to-transparent" />
      </div>

      {/* VS Display */}
      <div className={cn('relative z-10 flex items-center justify-center', isUltraCompact ? 'gap-4 mb-4' : isVeryCompact ? 'gap-5 mb-6' : isCompact ? 'gap-6 mb-8' : 'gap-8 mb-12')}>
        {/* Left Player - Swoosh from Left */}
        <motion.div
          variants={avatarSwooshLeftVariants}
          initial="initial"
          animate="animate"
          className="flex flex-col items-center"
        >
          <div className="relative">
            <Avatar
              src={leftAvatarUrl}
              name={leftName}
              size={avatarSize}
              playerType={leftPlayerType}
              showRankBorder={false}
            />
            {leftIsUser && (
              <div
                className={cn(
                  'absolute rounded-full bg-accent-teal flex items-center justify-center shadow-glow-teal',
                  isUltraCompact ? '-bottom-0.5 -right-0.5 w-7 h-7' : isVeryCompact ? '-bottom-1 -right-1 w-8 h-8' : '-bottom-1.5 -right-1.5 w-9 h-9'
                )}
              >
                <span className={cn('text-bg-primary font-bold', isUltraCompact ? 'text-[10px]' : 'text-xs')}>{t('countdown.you')}</span>
              </div>
            )}
          </div>
          <p className={cn('name-text font-heading font-bold text-text-primary mt-2 max-w-[100px] truncate text-center', isUltraCompact ? 'text-sm' : isVeryCompact ? 'text-base' : 'text-lg')}>
            {leftName}
          </p>
          <p className={cn('text-accent-teal font-heading font-semibold', isUltraCompact ? 'text-xs' : 'text-sm')}>
            {leftMmr} {t('results.mmr')}
          </p>
        </motion.div>

        {/* VS - Purple Lightning */}
        <motion.div
          variants={vsVariants}
          initial="initial"
          animate="animate"
          className={cn('relative', isUltraCompact ? 'px-1.5' : isVeryCompact ? 'px-2' : 'px-4')}
        >
          <span
            className={cn('font-heading font-black text-accent-purple vs-lightning', isUltraCompact ? 'text-4xl' : isVeryCompact ? 'text-5xl' : 'text-6xl')}
            style={{
              textShadow: '0 0 30px rgba(147, 51, 234, 0.8), 0 0 60px rgba(147, 51, 234, 0.4)'
            }}
          >
            {t('countdown.vs')}
          </span>
        </motion.div>

        {/* Right Player - Swoosh from Right */}
        <motion.div
          variants={avatarSwooshRightVariants}
          initial="initial"
          animate="animate"
          className="flex flex-col items-center"
        >
          <div className="relative">
            <Avatar
              src={rightAvatarUrl}
              name={rightName}
              size={avatarSize}
              playerType={rightPlayerType}
              showRankBorder={false}
            />
          </div>
          <p className={cn('name-text font-heading font-bold text-text-primary mt-2 max-w-[100px] truncate text-center', isUltraCompact ? 'text-sm' : isVeryCompact ? 'text-base' : 'text-lg')}>
            {rightName}
          </p>
          <p className={cn('text-accent-orange font-heading font-semibold', isUltraCompact ? 'text-xs' : 'text-sm')}>
            {isPracticeMatch ? t('search.practiceNoMmr', 'Solo session with no MMR changes') : `${rightMmr} ${t('results.mmr')}`}
          </p>
        </motion.div>
      </div>

      {/* Countdown */}
      <Countdown count={countValue} />
    </motion.div>
  );
}

// ============================================
// Question Screen - Premium Design with Space Background
// ============================================
export function QuestionScreen() {
  const { t } = useTranslation();
  // const categories = useCategoryStore((state) => state.categories);
  const settings = useSettingsStore((state) => state.settings);
  const {
    currentQuestion,
    selectedAnswer,
    answerSubmitted,
    submitAnswer,
    players,
    // matchCategory,
    questionStartServerMs,
    serverTimeOffsetMs,
    timeLimitMs,
    connectionState,
    reconnectAttempt,
    reconnectMax,
    openLeavePrompt,
    opponentAnswered: opponentAnsweredFromStore,
    isSpectator,
    matchMode,
  } = useGameStore();
  const { user } = useAuthStore();
  const sessionUserId = nakama.getSession()?.user_id || null;
  const currentUserId = sessionUserId || user?.userId || '';
  const timeLimitSeconds = Math.ceil(timeLimitMs / 1000);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const { isCompact, isVeryCompact, isUltraCompact } = useViewportDensity();
  const isPracticeMatch = !isSpectator && matchMode === 'practice';

  useEffect(() => {
    setTimeLeft(timeLimitSeconds);
  }, [timeLimitSeconds]);

  // Timer should continue updating even after answer submission
  useEffect(() => {
    if (!questionStartServerMs || serverTimeOffsetMs === null) return;

    const updateTime = () => {
      const serverNowMs = Date.now() - serverTimeOffsetMs;
      const remainingMs = Math.max(0, (questionStartServerMs + timeLimitMs) - serverNowMs);
      setTimeLeft(Math.ceil(remainingMs / 1000));
    };

    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, [questionStartServerMs, serverTimeOffsetMs, timeLimitMs]);

  if (!currentQuestion) return null;

  const denseOptionLayout = isVeryCompact || (isCompact && currentQuestion.question.options.length >= 4);
  const ultraTightLayout = isUltraCompact || denseOptionLayout;

  const { left, right, leftIsUser } = getDisplayPlayers(players, currentUserId, isSpectator);
  const opponent = leftIsUser ? right : null;
  const leftName = leftIsUser
    ? formatQuizDisplayName(t('countdown.you'), t('countdown.you'))
    : formatQuizDisplayName(left?.username, t('game.playerOne'));
  const rightName = isPracticeMatch
    ? t('search.modePractice', 'Practice')
    : formatQuizDisplayName(right?.username, t('game.playerTwo'));
  const leftAvatarUrl = leftIsUser ? user?.photoUrl : left?.avatarUrl;
  const rightAvatarUrl = right?.avatarUrl;
  const opponentAnswered = isPracticeMatch
    ? true
    : isSpectator
    ? (right?.hasAnswered || false)
    : (opponentAnsweredFromStore || opponent?.hasAnswered || false);
  const opponentDisconnected = isPracticeMatch
    ? false
    : isSpectator
    ? players.some(p => !p.connected)
    : (opponent && !opponent.connected);
  const isTimeUp = timeLeft <= 0;
  const isConnectionBlocked = connectionState === 'disconnected';
  const effectiveAnswerSubmitted = isSpectator ? false : answerSubmitted;
  const effectiveSelectedAnswer = isSpectator ? null : selectedAnswer;
  const isLocked = effectiveAnswerSubmitted || isTimeUp || isConnectionBlocked || isSpectator;
  const showOpponentProgress = settings.showOpponentProgress && !isSpectator && !isPracticeMatch;
  const questionTimerState = getTimerState(timeLeft);
  const questionTimerProgress = timeLimitSeconds > 0 ? clampProgress(timeLeft / timeLimitSeconds) : 0;
  const sideRailProgress = questionTimerProgress;
  const sideRailState: SideTimerState = questionTimerState;
  const topBarAvatarSize: 'lg' | 'xl' = ultraTightLayout ? 'lg' : 'xl';
  const topBarNameMaxWidthClass = ultraTightLayout ? 'max-w-[58px]' : isVeryCompact ? 'max-w-[64px]' : isCompact ? 'max-w-[82px]' : 'max-w-[102px]';
  const topBarScoreTextClass = ultraTightLayout ? 'text-lg' : isVeryCompact ? 'text-xl' : 'text-2xl';
  const topBarNameTextClass = ultraTightLayout ? 'text-[9px]' : isVeryCompact ? 'text-[10px]' : 'text-xs';

  // Determine who is leading
  const leftScore = left?.score || 0;
  const rightScore = right?.score || 0;

  // Keep question phase clean: no live winner/loser switching while timer is running.
  const leftAvatarState = effectiveAnswerSubmitted && leftIsUser ? 'answered' : 'idle';
  const rightAvatarState = opponentAnswered ? 'answered' : 'idle';

  // const categoryMatch = categories.find(c => c.id === matchCategory);
  // const categoryName = categoryMatch?.name || t('search.defaultCategory');

  const leaveActionLabel = isSpectator ? t('game.leave') : t('game.surrender');

  // Passage-aware: check if question has associated passage text
  const questionWithPassage = currentQuestion.question as { passage?: string; passage_text?: string };
  const passageText = questionWithPassage.passage || questionWithPassage.passage_text || '';
  const hasPassage = !!passageText;

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-viewport flex flex-col relative overflow-hidden no-x-overflow"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_26%,rgba(11,16,32,0.98)_65%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#111b33] to-[#0b1020]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Header Section */}
      <div
        className={cn(
          'relative z-10',
          isUltraCompact ? 'px-2.5 pt-1.5 pb-1' : isVeryCompact ? 'px-3 pt-2 pb-1.5' : isCompact ? 'px-3.5 pt-2.5 pb-2' : 'px-4 pt-3 pb-2.5'
        )}
      >
        {/* Top Row: Players + Timer */}
        <div
          className={cn(
            'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start',
            isUltraCompact ? 'py-0 mb-1.5 gap-x-2' : isVeryCompact ? 'py-0.5 mb-2 gap-x-2.5' : isCompact ? 'py-1 mb-2.5 gap-x-3' : 'py-1.5 mb-3 gap-x-3.5'
          )}
        >
          {/* Left Player */}
          <motion.div
            className={cn('flex min-w-0 flex-col items-start justify-center text-left', isUltraCompact ? 'pr-1' : isVeryCompact ? 'pr-1.5' : 'pr-2')}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className={cn('flex flex-col items-center self-start', isUltraCompact ? 'gap-0.5' : 'gap-1')}>
              <p className={cn('name-text uppercase tracking-wide text-white/70 font-semibold text-center', topBarNameTextClass, topBarNameMaxWidthClass)}>
                {leftName}
              </p>
              <div className={cn('mt-0.5 flex items-center', isUltraCompact ? 'gap-1.5' : 'gap-2')}>
                <Avatar
                  src={leftAvatarUrl}
                  name={leftName}
                  size={topBarAvatarSize}
                  playerType={leftIsUser ? 'you' : 'neutral'}
                  state={leftAvatarState}
                  showGlow={true}
                  effectStyle="fire"
                />
                <p className={cn('font-score font-bold text-sky-300 leading-none', topBarScoreTextClass)}>
                  {leftScore}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Center: Circular Timer */}
          <motion.div
            className={cn('flex shrink-0 flex-col items-center', isVeryCompact ? 'px-1.5' : 'px-2')}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
          >
            {settings.showTimer ? (
              <CircularTimer
                timeLeft={timeLeft}
                totalTime={timeLimitSeconds}
                size={isUltraCompact ? 63 : isVeryCompact ? 70 : isCompact ? 83 : 93}
                strokeWidth={4}
                showGlow={true}
              />
            ) : (
              <div className={cn('flex items-center justify-center rounded-full border border-cyan-400/60 bg-black/40', isUltraCompact ? 'w-[56px] h-[56px]' : isVeryCompact ? 'w-[60px] h-[60px]' : isCompact ? 'w-[72px] h-[72px]' : 'w-[80px] h-[80px]')}>
                <span className={cn('font-score font-bold text-cyan-300', isUltraCompact ? 'text-sm' : isVeryCompact ? 'text-base' : isCompact ? 'text-lg' : 'text-xl')}>
                  {currentQuestion.questionNumber}/{currentQuestion.totalQuestions}
                </span>
              </div>
            )}
          </motion.div>

          {/* Right Player */}
          <motion.div
            className={cn('flex min-w-0 flex-col items-end justify-center text-right', isUltraCompact ? 'pl-1' : isVeryCompact ? 'pl-1.5' : 'pl-2')}
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className={cn('flex flex-col items-center self-end', isUltraCompact ? 'gap-0.5' : 'gap-1')}>
              <p className={cn('name-text uppercase tracking-wide text-white/70 font-semibold text-center', topBarNameTextClass, topBarNameMaxWidthClass)}>
                {rightName}
              </p>
              <div className={cn('mt-0.5 flex items-center', isUltraCompact ? 'gap-1.5' : 'gap-2')}>
                <p className={cn('font-score font-bold text-sky-300 leading-none', topBarScoreTextClass)}>
                  {rightScore}
                </p>
                <Avatar
                  src={rightAvatarUrl}
                  name={rightName}
                  size={topBarAvatarSize}
                  playerType={leftIsUser ? 'opponent' : 'neutral'}
                  state={rightAvatarState}
                  showGlow={true}
                  effectStyle="fire"
                />
              </div>
            </div>
          </motion.div>
        </div>

        <QuestionProgress
          total={currentQuestion.totalQuestions}
          current={currentQuestion.questionNumber}
        />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          'flex-1 flex flex-col relative z-10 min-h-0 overflow-y-auto overscroll-contain',
          isUltraCompact ? 'px-2.5 pb-12' : isVeryCompact ? 'px-3 pb-14' : isCompact ? 'px-3.5 pb-16' : 'px-4 pb-20'
        )}
      >
        {/* Connection Banners */}
        <AnimatePresence>
          {connectionState === 'reconnecting' && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-amber-500/20 backdrop-blur-sm text-amber-300 px-4 py-2 rounded-xl mb-3 text-center text-sm border border-amber-500/30"
            >
              {t('game.reconnecting')}{reconnectAttempt && reconnectMax ? ` (${reconnectAttempt}/${reconnectMax})` : ''}
            </motion.div>
          )}
          {opponentDisconnected && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-500/20 backdrop-blur-sm text-red-300 px-4 py-2 rounded-xl mb-3 text-center text-sm border border-red-500/30"
            >
              {isSpectator ? t('game.playerDisconnectedWaiting') : t('game.opponentDisconnected')}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content area: passage-aware or standard question ── */}
        <PassageGameLayout
          hasPassage={hasPassage}
          compact={isCompact}
          veryCompact={isVeryCompact}
          className="flex-1 min-h-0"
          passageContent={
            <PassagePanel
              text={passageText}
              compact={isCompact}
              veryCompact={isVeryCompact}
            />
          }
          questionContent={
            <div className="flex flex-col h-full">
              {/* Question text */}
              <div className={cn('text-center flex-shrink-0', isUltraCompact ? 'mb-2 mt-0.5' : isVeryCompact ? 'mb-3 mt-1' : isCompact ? 'mb-4 mt-2' : 'mb-5 mt-3')}>
                <h2
                  className={cn(
                    'font-question text-white leading-tight font-semibold tracking-[-0.01em]',
                    isUltraCompact ? 'text-[20px]' : isVeryCompact ? 'text-[22px]' : isCompact ? 'text-[25px]' : 'text-[32px]'
                  )}
                >
                  {currentQuestion.question.text}
                </h2>
              </div>

              <div className={cn('relative flex-1', isUltraCompact ? 'pb-0.5' : isVeryCompact ? 'pb-1' : 'pb-1.5')}>
                <SideTimerRails
                  progress={sideRailProgress}
                  state={sideRailState}
                  pulse={questionTimerState === 'danger' && !isTimeUp}
                  compact={isCompact}
                  veryCompact={isVeryCompact}
                />

                <div className={cn(isUltraCompact ? 'px-8' : isVeryCompact ? 'px-9' : isCompact ? 'px-10' : 'px-11')}>
                  <QuestionRenderer
                    mode="answer"
                    question={currentQuestion.question}
                    isLocked={isLocked}
                    selectedAnswerIndex={effectiveSelectedAnswer}
                    answerSubmitted={effectiveAnswerSubmitted}
                    onSelectAnswer={(answerIndex) => submitAnswer(answerIndex)}
                    animationDelayBase={0.22}
                    animationDelayStep={0.06}
                    compact={isCompact || denseOptionLayout}
                    veryCompact={denseOptionLayout}
                    visualStyle="modernClassic"
                    showLetterBadge={false}
                  />
                </div>
              </div>
            </div>
          }
        />

        {/* Waiting Overlay */}
        <AnimatePresence>
          {showOpponentProgress && effectiveAnswerSubmitted && !opponentAnswered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{
                background: 'linear-gradient(180deg, rgba(11, 16, 32, 0.95) 0%, rgba(17, 27, 51, 0.95) 100%)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                {/* Your answer confirmed */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="mb-8"
                >
                  <motion.div
                    className="w-20 h-20 rounded-full bg-accent-teal/20 flex items-center justify-center mx-auto mb-3 ring-2 ring-accent-teal"
                    animate={{
                      boxShadow: ['0 0 20px rgba(0, 212, 170, 0.3)', '0 0 40px rgba(0, 212, 170, 0.5)', '0 0 20px rgba(0, 212, 170, 0.3)'],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg className="w-10 h-10 text-accent-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <p className="text-accent-teal font-heading font-bold text-2xl tracking-wide">{t('game.answerLockedIn')}</p>
                </motion.div>

                {/* Opponent thinking */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Avatar
                      name={rightName}
                      src={rightAvatarUrl}
                      size="xl"
                      playerType="opponent"
                      state="thinking"
                      showGlow={true}
                    />
                  </motion.div>

                  <div className="flex gap-1.5 justify-center mt-5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        className="w-2.5 h-2.5 rounded-full bg-accent-orange"
                      />
                    ))}
                  </div>

                  <p className="text-white font-heading text-2xl mt-5">
                    {t('game.waitingOn', { name: rightName })}
                  </p>
                  <p className="text-white/60 text-lg mt-2">
                    {t('game.revealingResults')}
                  </p>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className={cn(
          'fixed inset-x-0 z-40 px-3 pointer-events-none',
          isVeryCompact ? 'bottom-0 pb-[max(6px,env(safe-area-inset-bottom))]' : 'bottom-0 pb-[max(8px,env(safe-area-inset-bottom))]'
        )}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className="mx-auto flex w-full max-w-[var(--app-content-max-width)] justify-center">
          <button
            type="button"
            onClick={openLeavePrompt}
            className="pointer-events-auto min-w-[132px] rounded-lg border border-red-400/50 bg-red-500/25 px-3.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-red-100 shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition-colors hover:bg-red-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          >
            {leaveActionLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Reveal Screen - Beneficial Knowledge Style Results
// ============================================
export function RevealScreen() {
  const { t } = useTranslation();
  const { currentQuestion, lastReveal, players, isSpectator, pendingQuestion, consumePendingQuestion, matchMode, matchPacing } = useGameStore();
  const { user } = useAuthStore();
  const sessionUserId = nakama.getSession()?.user_id || null;
  const currentUserId = sessionUserId || user?.userId || '';
  const [showCountdown, setShowCountdown] = useState(false);
  const [showLightning, setShowLightning] = useState(false);
  const [showScreenShake, setShowScreenShake] = useState(false);
  const [revealPhase, setRevealPhase] = useState<'suspense' | 'reveal' | 'effects' | 'scores'>('suspense');
  const [previousScore, setPreviousScore] = useState(0);
  const [previousOpponentScore, setPreviousOpponentScore] = useState(0);
  const [showMyScoreRoll, setShowMyScoreRoll] = useState(false);
  const [showOpponentScoreRoll, setShowOpponentScoreRoll] = useState(false);
  const [revealRailProgress, setRevealRailProgress] = useState(1);
  const { isCompact, isVeryCompact, isUltraCompact } = useViewportDensity();
  const isPracticeMatch = !isSpectator && matchMode === 'practice';
  const effectivePacing = matchPacing || DEFAULT_MATCH_PACING;
  const revealSuspenseMs = Math.max(0, effectivePacing.revealSuspenseMs);
  const revealEffectsMs = Math.max(0, effectivePacing.revealEffectsMs);
  const revealScoresMs = Math.max(0, effectivePacing.revealScoresMs);
  const roundPulseEnabled = effectivePacing.roundPulseEnabled === true;
  const roundPulseTotalMs = getRoundPulseTotalMs(effectivePacing);
  const [scoreFlyouts, setScoreFlyouts] = useState<Array<{
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    points: number;
    color: string;
  }>>([]);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const myScoreRef = useRef<HTMLDivElement | null>(null);
  const opponentScoreRef = useRef<HTMLDivElement | null>(null);
  const nextRoundNumber = currentQuestion?.questionNumber ? currentQuestion.questionNumber + 1 : null;

  // Animation sequence timing
  useEffect(() => {
    if (!lastReveal) return;

    const initialTimer = setTimeout(() => {
      // Reset phases on new reveal
      setRevealPhase('suspense');
      setShowLightning(false);
      setShowScreenShake(false);
      setShowCountdown(false);
      setRevealRailProgress(1);

      // Store previous scores for animation
      const myReveal = lastReveal.playerResults[currentUserId];
      const myTotal = players.find(p => p.userId === currentUserId)?.score ?? (myReveal?.totalScore ?? 0);
      const myGained = myReveal?.scoreGained ?? 0;
      setPreviousScore(Math.max(0, myTotal - myGained));

      const opponentId = players.find(p => p.userId !== currentUserId)?.userId;
      if (opponentId) {
        const opponentReveal = lastReveal.playerResults[opponentId];
        const opponentTotal = players.find(p => p.userId === opponentId)?.score ?? (opponentReveal?.totalScore ?? 0);
        const opponentGained = opponentReveal?.scoreGained ?? 0;
        setPreviousOpponentScore(Math.max(0, opponentTotal - opponentGained));
      }

      setShowMyScoreRoll(false);
      setShowOpponentScoreRoll(false);
      setScoreFlyouts([]);
    }, 0);

    // Phase 1: Suspense
    const revealTimer = setTimeout(() => setRevealPhase('reveal'), revealSuspenseMs);

    // Phase 2: Effects - Lightning or Shake
    const effectsTimer = setTimeout(() => {
      setRevealPhase('effects');
      const userResult = lastReveal.playerResults[currentUserId];
      if (userResult?.correct) {
        setShowLightning(true);
      } else if (userResult && !userResult.correct) {
        setShowScreenShake(true);
      }
    }, revealEffectsMs);

    // Phase 3: Scores
    const scoresTimer = setTimeout(() => setRevealPhase('scores'), revealScoresMs);

    // Note: Countdown is now triggered by pendingQuestion arriving (see effect below)
    // This fixes the race condition where server could send next question before animation finishes

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(revealTimer);
      clearTimeout(effectsTimer);
      clearTimeout(scoresTimer);
    };
  }, [lastReveal, currentUserId, players, revealSuspenseMs, revealEffectsMs, revealScoresMs]);

  // Trigger countdown when server sends next question (pendingQuestion is set)
  // This ensures countdown always plays fully - the store queues the question instead of transitioning
  useEffect(() => {
    if (!pendingQuestion || revealPhase !== 'scores') return;
    if (!roundPulseEnabled) {
      const consumeTimer = setTimeout(() => {
        consumePendingQuestion();
      }, 0);
      return () => clearTimeout(consumeTimer);
    }
    if (showCountdown) return;
    const countdownTimer = setTimeout(() => setShowCountdown(true), 0);
    return () => clearTimeout(countdownTimer);
  }, [pendingQuestion, showCountdown, revealPhase, roundPulseEnabled, consumePendingQuestion]);

  useEffect(() => {
    if (!showCountdown) return;

    const startMs = Date.now();
    const updateProgress = () => {
      const elapsed = Date.now() - startMs;
      setRevealRailProgress(clampProgress(1 - elapsed / roundPulseTotalMs));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 50);
    return () => clearInterval(interval);
  }, [showCountdown, roundPulseTotalMs]);

  // Score flyouts (needs to run before any early returns to satisfy hooks rules)
  useEffect(() => {
    if (revealPhase !== 'scores') return;
    if (!lastReveal) return;

    const { left, right } = getDisplayPlayers(players, currentUserId, isSpectator);
    const leftResult = left ? lastReveal.playerResults[left.userId] : null;
    const rawRightResult = right ? lastReveal.playerResults[right.userId] : null;
    const rightResult = rawRightResult ?? {
      answerIndex: -1,
      correct: false,
      scoreGained: 0,
      totalScore: right?.score ?? 0,
      streak: 0,
      timeMs: null,
    };

    const myResult = leftResult;
    const opponentResult = rightResult;
    const correctIndex = lastReveal.correctIndex;
    const sourceNode = optionRefs.current[correctIndex];
    if (!sourceNode) return;

    const sourceRect = sourceNode.getBoundingClientRect();
    const sourceX = sourceRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top + sourceRect.height / 2;

    const nextFlyouts: Array<{
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      points: number;
      color: string;
    }> = [];

    if (myResult?.correct && myResult.scoreGained > 0 && myScoreRef.current) {
      const targetRect = myScoreRef.current.getBoundingClientRect();
      nextFlyouts.push({
        id: `flyout-my-${lastReveal.matchId || lastReveal.correctIndex}`,
        fromX: sourceX - 16,
        fromY: sourceY,
        toX: targetRect.left + targetRect.width / 2,
        toY: targetRect.top + targetRect.height / 2,
        points: myResult.scoreGained,
        color: '#20c5ff',
      });
    }

    if (opponentResult?.correct && opponentResult.scoreGained > 0 && opponentScoreRef.current) {
      const targetRect = opponentScoreRef.current.getBoundingClientRect();
      nextFlyouts.push({
        id: `flyout-opp-${lastReveal.matchId || lastReveal.correctIndex}`,
        fromX: sourceX + 16,
        fromY: sourceY,
        toX: targetRect.left + targetRect.width / 2,
        toY: targetRect.top + targetRect.height / 2,
        points: opponentResult.scoreGained,
        color: '#ff8a4d',
      });
    }

    let completeTimer: ReturnType<typeof setTimeout> | undefined;
    const applyTimer = setTimeout(() => {
      setScoreFlyouts(nextFlyouts);
      if (nextFlyouts.length === 0) {
        setShowMyScoreRoll(true);
        setShowOpponentScoreRoll(true);
        return;
      }

      completeTimer = setTimeout(() => {
        setShowMyScoreRoll(true);
        setShowOpponentScoreRoll(true);
        setScoreFlyouts([]);
      }, 1000);
    }, 0);

    return () => {
      clearTimeout(applyTimer);
      if (completeTimer) clearTimeout(completeTimer);
    };
  }, [revealPhase, lastReveal, players, currentUserId, isSpectator]);

  // Handle countdown completion - transition to the pending question
  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false);
    setRevealRailProgress(1);
    consumePendingQuestion();
  }, [consumePendingQuestion]);

  if (!currentQuestion || !lastReveal) return null;

  const { left, right, leftIsUser } = getDisplayPlayers(players, currentUserId, isSpectator);
  const leftName = leftIsUser
    ? formatQuizDisplayName(t('countdown.you'), t('countdown.you'))
    : formatQuizDisplayName(left?.username, t('game.playerOne'));
  const rightName = isPracticeMatch
    ? t('search.modePractice', 'Practice')
    : formatQuizDisplayName(right?.username, t('game.playerTwo'));
  const leftAvatarUrl = leftIsUser ? user?.photoUrl : left?.avatarUrl;
  const rightAvatarUrl = right?.avatarUrl;
  const leftResult = left ? lastReveal.playerResults[left.userId] : null;
  const rawRightResult = right ? lastReveal.playerResults[right.userId] : null;
  const rightResult = rawRightResult ?? {
    answerIndex: -1,
    correct: false,
    scoreGained: 0,
    totalScore: right?.score ?? 0,
    timeMs: null,
  };

  const myResult = leftResult;
  const opponentResult = rightResult;

  const formatTime = (timeMs: number | null | undefined) => {
    if (timeMs === null || timeMs === undefined || !Number.isFinite(timeMs)) return '-';
    if (timeMs < 0) return '0.0';
    return (timeMs / 1000).toFixed(1);
  };

  const denseRevealOptionLayout = isVeryCompact || (isCompact && currentQuestion.question.options.length >= 4);
  const revealTightLayout = isUltraCompact || denseRevealOptionLayout;
  const revealSideRailProgress = showCountdown ? revealRailProgress : 1;
  const revealSideRailState = getProgressTimerState(revealSideRailProgress);
  const revealHeaderAvatarSize: 'lg' | 'xl' = revealTightLayout ? 'lg' : 'xl';
  const revealHeaderNameMaxWidthClass = revealTightLayout ? 'max-w-[58px]' : isVeryCompact ? 'max-w-[64px]' : isCompact ? 'max-w-[82px]' : 'max-w-[102px]';
  const revealHeaderNameTextClass = revealTightLayout ? 'text-[9px]' : isVeryCompact ? 'text-[10px]' : 'text-xs';
  const revealHeaderScoreTextClass = revealTightLayout ? 'text-lg' : isVeryCompact ? 'text-xl' : 'text-2xl';
  const revealLeadStates = getLeadAvatarStates(myResult?.totalScore || 0, opponentResult.totalScore || 0, !isPracticeMatch && revealPhase !== 'suspense');

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        'h-viewport flex flex-col relative overflow-hidden no-x-overflow',
        showScreenShake && 'screen-shake'
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_26%,rgba(11,16,32,0.98)_65%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#111b33] to-[#0b1020]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Score Flyouts */}
      <AnimatePresence>
        {scoreFlyouts.map((flyout) => (
          <motion.div
            key={flyout.id}
            className="fixed pointer-events-none z-40 font-heading font-black text-xl"
            style={{
              left: flyout.fromX,
              top: flyout.fromY,
              color: flyout.color,
              textShadow: `0 0 12px ${flyout.color}`,
            }}
            initial={{ opacity: 0, scale: 0.8, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.8, 1.1, 0.9],
              x: flyout.toX - flyout.fromX,
              y: flyout.toY - flyout.fromY,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            +{flyout.points}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Red Flash Overlay for Wrong Answer */}
      <AnimatePresence>
      </AnimatePresence>

      {/* Lightning Strike Effect */}
      <LightningStrike
        show={showLightning}
        onComplete={() => setShowLightning(false)}
      />

      {/* Header with Scores and Avatars */}
      <div
        className={cn(
          'relative z-10',
          isUltraCompact ? 'px-2.5 pt-1.5 pb-1' : isVeryCompact ? 'px-3 pt-2 pb-1.5' : isCompact ? 'px-3.5 pt-2.5 pb-2' : 'px-4 pt-3 pb-2.5'
        )}
      >
        <div
          className={cn(
            'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start',
            isUltraCompact ? 'py-0 gap-x-2' : isVeryCompact ? 'py-0.5 gap-x-2.5' : isCompact ? 'py-1 gap-x-3' : 'py-1.5 gap-x-3.5'
          )}
        >
          <motion.div
            className={cn('flex min-w-0 flex-col items-start justify-center text-left', isUltraCompact ? 'pr-1' : isVeryCompact ? 'pr-1.5' : 'pr-2')}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className={cn('flex flex-col items-center self-start', isUltraCompact ? 'gap-0.5' : 'gap-1')}>
              <p className={cn('name-text uppercase tracking-wide text-white/70 font-semibold text-center', revealHeaderNameTextClass, revealHeaderNameMaxWidthClass)}>
                {leftName}
              </p>
              <div className={cn('mt-0.5 flex items-center', isUltraCompact ? 'gap-1.5' : 'gap-2')}>
                <Avatar
                  src={leftAvatarUrl}
                  name={leftName}
                  size={revealHeaderAvatarSize}
                  playerType={leftIsUser ? 'you' : 'neutral'}
                  state={revealLeadStates.left}
                  showGlow={true}
                  effectStyle="fire"
                  className={cn(!myResult?.correct && revealPhase !== 'suspense' && 'opacity-60')}
                />
                <span ref={myScoreRef} className="flex items-center">
                  <ScoreRoll
                    value={myResult?.totalScore || 0}
                    previousValue={previousScore}
                    show={showMyScoreRoll}
                    className={cn('font-score font-bold text-sky-300 leading-none', revealHeaderScoreTextClass)}
                  />
                </span>
              </div>
              {myResult?.correct && revealPhase === 'scores' && (
                <span className="text-[10px] text-green-300 font-semibold leading-none">
                  +{myResult.scoreGained}
                </span>
              )}
            </div>
          </motion.div>

          <motion.div
            className={cn('flex shrink-0 flex-col items-center', isVeryCompact ? 'px-1.5' : 'px-2')}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div
              className={cn(
                'rounded-full border border-cyan-400/60 bg-black/40 text-cyan-300 font-score font-bold',
                isUltraCompact
                  ? 'w-[56px] h-[56px] text-sm flex items-center justify-center'
                  : isVeryCompact
                    ? 'w-[60px] h-[60px] text-base flex items-center justify-center'
                  : isCompact
                    ? 'w-[72px] h-[72px] text-lg flex items-center justify-center'
                    : 'w-[80px] h-[80px] text-xl flex items-center justify-center'
              )}
            >
              {currentQuestion.questionNumber}/{currentQuestion.totalQuestions}
            </div>
          </motion.div>

          <motion.div
            className={cn('flex min-w-0 flex-col items-end justify-center text-right', isUltraCompact ? 'pl-1' : isVeryCompact ? 'pl-1.5' : 'pl-2')}
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className={cn('flex flex-col items-center self-end', isUltraCompact ? 'gap-0.5' : 'gap-1')}>
              <span className={cn('name-text uppercase tracking-wide text-white/70 font-semibold text-center', revealHeaderNameTextClass, revealHeaderNameMaxWidthClass)}>
                {rightName}
              </span>
              <div className={cn('mt-0.5 flex items-center', isUltraCompact ? 'gap-1.5' : 'gap-2')}>
                <span ref={opponentScoreRef} className="flex items-center">
                  <ScoreRoll
                    value={opponentResult.totalScore || 0}
                    previousValue={previousOpponentScore}
                    show={showOpponentScoreRoll}
                    className={cn('font-score font-bold text-sky-300 leading-none', revealHeaderScoreTextClass)}
                  />
                </span>
                <Avatar
                  src={rightAvatarUrl}
                  name={rightName}
                  size={revealHeaderAvatarSize}
                  playerType={leftIsUser ? 'opponent' : 'neutral'}
                  state={revealLeadStates.right}
                  showGlow={true}
                  effectStyle="fire"
                  className={cn(!opponentResult.correct && revealPhase !== 'suspense' && 'opacity-60')}
                />
              </div>
              {opponentResult.correct && revealPhase === 'scores' && (
                <span className="text-[10px] text-green-300 font-semibold leading-none">
                  +{opponentResult.scoreGained}
                </span>
              )}
            </div>
          </motion.div>
        </div>

        <div className="flex justify-between mt-1.5 text-[10px] text-white/60 px-2">
          <p>{formatTime(myResult?.timeMs)}s</p>
          <p>{formatTime(opponentResult.timeMs)}s</p>
        </div>
      </div>

      <div
        className={cn(
          'flex-1 flex flex-col relative z-10',
          isUltraCompact ? 'px-2.5 pb-2 mt-1.5' : isVeryCompact ? 'px-3 pb-3 mt-2' : isCompact ? 'px-3.5 pb-4 mt-2.5' : 'px-4 pb-5 mt-3'
        )}
      >
        <motion.div
          className={cn(isUltraCompact ? 'mb-2.5' : isVeryCompact ? 'mb-3.5' : isCompact ? 'mb-4' : 'mb-5')}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className={cn('flex items-center justify-center', isUltraCompact ? 'mb-1' : isVeryCompact ? 'mb-1.5' : isCompact ? 'mb-2' : 'mb-2.5')}>
            <div
              className={cn(
                'font-semibold tracking-wide text-white/80 rounded-full border border-white/15 bg-white/5',
                isUltraCompact
                  ? 'text-[9px] px-1.5 py-0.5'
                  : isVeryCompact
                    ? 'text-[10px] px-2 py-0.5'
                  : isCompact
                    ? 'text-[10px] px-2.5 py-0.5'
                    : 'text-[11px] px-2.5 py-1'
              )}
            >
              
            </div>
          </div>
          <h2
            className={cn(
              'font-question text-white text-center leading-tight font-semibold tracking-[-0.01em]',
              isUltraCompact ? 'text-[20px]' : isVeryCompact ? 'text-[22px]' : isCompact ? 'text-[25px]' : 'text-[32px]'
            )}
          >
            {currentQuestion.question.text}
          </h2>
        </motion.div>

        <div className={cn('relative', isUltraCompact ? 'pb-0.5' : isVeryCompact ? 'pb-1' : 'pb-1.5')}>
          <SideTimerRails
            progress={revealSideRailProgress}
            state={revealSideRailState}
            pulse={showCountdown && revealSideRailState === 'danger'}
            compact={isCompact}
            veryCompact={isVeryCompact}
          />

          <div className={cn(isUltraCompact ? 'px-8' : isVeryCompact ? 'px-9' : isCompact ? 'px-10' : 'px-11')}>
            <QuestionRenderer
              mode="reveal"
              question={currentQuestion.question}
              revealPhase={revealPhase}
              correctIndex={lastReveal.correctIndex}
              myAnswerIndex={myResult?.answerIndex ?? null}
              myAnswerTimeSeconds={myResult?.timeMs ? myResult.timeMs / 1000 : null}
              registerOptionRef={(index, node) => {
                optionRefs.current[index] = node;
              }}
              animationDelayBase={0}
              animationDelayStep={0.08}
              compact={isCompact || denseRevealOptionLayout}
              veryCompact={denseRevealOptionLayout}
              visualStyle="modernClassic"
              showLetterBadge={false}
            />
          </div>
        </div>
      </div>

      {/* Countdown Pulse for Next Round */}
      <CountdownPulse
        show={showCountdown}
        nextRoundNumber={nextRoundNumber ?? undefined}
        onComplete={handleCountdownComplete}
        startDelayMs={effectivePacing.roundPulseStartDelayMs}
        completeDelayMs={effectivePacing.roundPulseCompleteDelayMs}
      />
    </motion.div>
  );
}

// ============================================
// Results Screen - Beneficial Knowledge Victory/Defeat
// ============================================
export function ResultsScreen() {
  const { t } = useTranslation();
  const { matchResult, players, playAgain, returnToHome, questionHistory, isSpectator, matchMode } = useGameStore();
  const settings = useSettingsStore((state) => state.settings);
  const { user, refreshProfile } = useAuthStore();
  const { isVeryCompact } = useViewportDensity();
  const [showReview, setShowReview] = useState(false);
  const sessionUserId = nakama.getSession()?.user_id || null;
  const currentUserId = sessionUserId || user?.userId || '';
  const isPracticeMatch = (matchResult?.mode === 'practice' || matchMode === 'practice') && !isSpectator;

  useEffect(() => {
    if (isPracticeMatch) return;
    refreshProfile();
  }, [isPracticeMatch, refreshProfile]);

  useEffect(() => {
    if (!settings.autoQueue || !matchResult || showReview || isSpectator) return;
    const timer = setTimeout(() => {
      playAgain();
    }, 5000);
    return () => clearTimeout(timer);
  }, [settings.autoQueue, matchResult, playAgain, showReview, isSpectator]);

  if (!matchResult) return null;

  const { left, right, leftIsUser } = getDisplayPlayers(players, currentUserId, isSpectator);
  const leftName = leftIsUser
    ? formatQuizDisplayName(t('countdown.you'), t('countdown.you'))
    : formatQuizDisplayName(left?.username, t('game.playerOne'));
  const rightName = isPracticeMatch
    ? t('search.modePractice', 'Practice')
    : formatQuizDisplayName(right?.username, t('game.playerTwo'));
  const leftAvatarUrl = leftIsUser ? user?.photoUrl : left?.avatarUrl;
  const rightAvatarUrl = right?.avatarUrl;
  const leftUserId = left?.userId || '';
  const rightUserId = isPracticeMatch ? '' : (right?.userId || '');
  const leftFinalScore = matchResult.finalScores[leftUserId] || 0;
  const rightFinalScore = isPracticeMatch ? 0 : (matchResult.finalScores[rightUserId] || 0);
  const isWinner = !isSpectator && !!currentUserId && matchResult.winnerId === currentUserId;
  const isDraw = matchResult.isDraw;
  const showVictory = !isPracticeMatch && !isSpectator && isWinner;
  const showDefeat = !isPracticeMatch && !isSpectator && !isWinner && !isDraw;
  const resultsAvatarSize: 'lg' | 'xl' = isVeryCompact ? 'lg' : 'xl';
  const resultLeftPlayerType = leftIsUser ? 'you' : 'neutral';
  const resultRightPlayerType = isPracticeMatch ? 'neutral' : (leftIsUser ? 'opponent' : 'neutral');
  const resultLeadStates = getLeadAvatarStates(leftFinalScore, rightFinalScore, !isPracticeMatch && !isDraw);
  const resultText = isPracticeMatch
    ? t('results.practiceComplete', 'Practice Complete')
    : isSpectator
    ? (isDraw ? t('results.draw') : t('results.final'))
    : (isWinner ? t('results.victory') : isDraw ? t('results.draw') : t('results.defeat'));
  const leftChange = isPracticeMatch || isSpectator || !leftUserId ? null : matchResult.mmrChanges[leftUserId];
  const rightChange = isPracticeMatch || isSpectator || !rightUserId ? null : matchResult.mmrChanges[rightUserId];
  const leftMmrChange = resolveDisplayedMmrChange(leftChange);
  const rightMmrChange = resolveDisplayedMmrChange(rightChange);
  const myStats = isSpectator || !currentUserId ? null : matchResult.playerStats[currentUserId];
  const practiceSummary = isPracticeMatch ? matchResult.practiceSummary : null;

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-viewport no-x-overflow overflow-y-auto flex flex-col items-center px-4 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] relative"
    >
      {/* Victory Background Effect */}
      {showVictory && (
        <div className="absolute inset-0 bg-gradient-to-b from-accent-teal/10 via-transparent to-transparent pointer-events-none" />
      )}

      {/* Result Banner */}
      <motion.div
        variants={showVictory ? victoryVariants : defeatVariants}
        initial="initial"
        animate="animate"
        className="text-center mb-6 mt-2 relative z-10"
      >
        <motion.h1
          variants={victoryTextVariants}
          initial="initial"
          animate="animate"
          className={cn(
            'font-heading text-6xl font-black mb-2',
            showVictory ? 'text-accent-teal' : isDraw ? 'text-text-primary' : showDefeat ? 'text-feedback-wrong' : 'text-text-primary'
          )}
          style={{
            textShadow: showVictory
              ? '0 0 40px rgba(0, 212, 170, 0.6), 0 0 80px rgba(0, 212, 170, 0.3)'
              : isDraw
              ? '0 0 40px rgba(255, 255, 255, 0.2)'
              : showDefeat
              ? '0 0 40px rgba(239, 68, 68, 0.4)'
              : '0 0 40px rgba(255, 255, 255, 0.2)'
          }}
        >
          {resultText}
        </motion.h1>
          {matchResult.reason === 'forfeit' && (
          <p className="text-text-secondary">
            {isSpectator
              ? t('results.matchEndedByForfeit')
              : matchResult.winnerId
              ? (matchResult.winnerId === currentUserId ? t('results.opponentForfeited') : t('results.youForfeited'))
              : t('results.matchEndedByForfeit')}
          </p>
        )}
        {matchResult.reason === 'surrender' && (
          <p className="text-text-secondary">
            {isSpectator
              ? t('results.matchEndedBySurrender')
              : matchResult.winnerId
              ? (matchResult.winnerId === currentUserId ? t('results.opponentSurrendered') : t('results.youSurrendered'))
              : t('results.matchEndedBySurrender')}
          </p>
        )}
      </motion.div>

      {/* Score Comparison */}
      {isPracticeMatch ? (
        <Card variant="gaming" padding="lg" className="w-full max-w-sm sm:max-w-md lg:max-w-lg mb-6 relative z-10">
          <div className="text-center">
            <div className="mb-2 flex justify-center">
              <Avatar
                src={leftAvatarUrl}
                name={leftName}
                size={resultsAvatarSize}
                playerType={resultLeftPlayerType}
                state="winning"
                effectMode="result"
                showGlow
                effectStyle="fire"
              />
            </div>
            <p className="name-text mx-auto text-xs text-accent-teal mb-1 font-semibold max-w-[160px]">{leftName}</p>
            <p className="font-score text-5xl font-bold text-text-primary">
              {leftFinalScore}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-teal">
              {t('results.practiceScore', 'Practice Score')}
            </p>
          </div>
        </Card>
      ) : (
        <Card variant="gaming" padding="lg" className="w-full max-w-sm sm:max-w-md lg:max-w-lg mb-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1 min-w-0">
              <div className="mb-2 flex justify-center">
                <Avatar
                  src={leftAvatarUrl}
                  name={leftName}
                  size={resultsAvatarSize}
                  playerType={resultLeftPlayerType}
                  state={resultLeadStates.left}
                  effectMode="result"
                  showGlow
                  effectStyle="fire"
                />
              </div>
              <p className="name-text mx-auto text-xs text-accent-teal mb-1 font-semibold max-w-[120px]">{leftName}</p>
              <p className="font-score text-4xl font-bold text-text-primary">
                {leftFinalScore}
              </p>
              {leftMmrChange !== null && (
                <motion.p
                  variants={scoreChangeVariants}
                  initial="initial"
                  animate="animate"
                  className={cn(
                    'font-heading font-bold mt-2 text-lg',
                    leftMmrChange >= 0 ? 'text-feedback-correct' : 'text-feedback-wrong'
                  )}
                >
                  {leftMmrChange >= 0 ? '+' : ''}{leftMmrChange} {t('results.mmr')}
                </motion.p>
              )}
            </div>
            <div className="text-3xl font-heading text-accent-purple/50 px-4">{t('countdown.vs')}</div>
            <div className="text-center flex-1 min-w-0">
              <div className="mb-2 flex justify-center">
                <Avatar
                  src={rightAvatarUrl}
                  name={rightName}
                  size={resultsAvatarSize}
                  playerType={resultRightPlayerType}
                  state={resultLeadStates.right}
                  effectMode="result"
                  showGlow
                  effectStyle="fire"
                />
              </div>
              <p className="name-text mx-auto text-xs text-accent-orange mb-1 font-semibold max-w-[120px]">
                {rightName}
              </p>
              <p className="font-score text-4xl font-bold text-text-primary">
                {rightFinalScore}
              </p>
              {rightMmrChange !== null && (
                <p className={cn(
                  'font-heading font-bold mt-2 text-lg',
                  rightMmrChange >= 0 ? 'text-feedback-correct' : 'text-feedback-wrong'
                )}>
                  {rightMmrChange >= 0 ? '+' : ''}{rightMmrChange} {t('results.mmr')}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Performance Stats */}
      {!isSpectator && (
        <Card variant="default" padding="md" className="w-full max-w-sm sm:max-w-md lg:max-w-lg mb-8 relative z-10">
          <h3 className="font-heading font-semibold text-text-primary mb-3 text-center">{t('results.yourPerformance')}</h3>
          <div className="h-px bg-white/10 mb-3" />
          <div className="flex justify-around">
            <div className="text-center">
              <p className="font-heading text-2xl font-bold text-text-primary">
                {myStats?.correctAnswers || 0}/{myStats?.totalAnswers || 0}
              </p>
              <p className="text-xs text-text-secondary">{t('results.correct')}</p>
            </div>
            <div className="text-center">
              <p className="font-heading text-2xl font-bold text-accent-teal">
                {(myStats?.totalAnswers ?? 0) > 0
                  ? Math.round(((myStats?.correctAnswers ?? 0) / (myStats?.totalAnswers ?? 1)) * 100)
                  : 0}%
              </p>
              <p className="text-xs text-text-secondary">{t('results.accuracy')}</p>
            </div>
            <div className="text-center">
              <p className="font-heading text-2xl font-bold text-text-primary">
                {((myStats?.averageTime || 0) / 1000).toFixed(1)}s
              </p>
              <p className="text-xs text-text-secondary">{t('results.avgTime')}</p>
            </div>
          </div>
        </Card>
      )}

      {!isSpectator && isPracticeMatch && practiceSummary && (
        <Card variant="default" padding="md" className="w-full max-w-sm sm:max-w-md lg:max-w-lg mb-8 relative z-10">
          <h3 className="font-heading font-semibold text-text-primary mb-3 text-center">{t('results.practiceSummary', 'Practice Summary')}</h3>
          <div className="h-px bg-white/10 mb-3" />
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-heading text-xl font-bold text-accent-teal">{practiceSummary.session.correctAnswers}/{practiceSummary.session.totalQuestions}</p>
              <p className="text-xs text-text-secondary">{t('results.correct')}</p>
            </div>
            <div>
              <p className="font-heading text-xl font-bold text-accent-teal">{practiceSummary.session.accuracy}%</p>
              <p className="text-xs text-text-secondary">{t('results.accuracy')}</p>
            </div>
            <div>
              <p className="font-heading text-xl font-bold text-text-primary">{practiceSummary.overall.sessionsPlayed}</p>
              <p className="text-xs text-text-secondary">{t('results.practiceSessions', 'Sessions')}</p>
            </div>
            <div>
              <p className="font-heading text-xl font-bold text-text-primary">{practiceSummary.category.bestScore}</p>
              <p className="text-xs text-text-secondary">{t('results.practiceBestScore', 'Best score')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg space-y-3 relative z-10">
        {!isSpectator && (
          <Button variant="gaming" size="xl" fullWidth onClick={playAgain}>
            {t('results.playAgain')}
          </Button>
        )}
        {!isSpectator && questionHistory.length > 0 && (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => setShowReview(true)}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {t('results.reviewAnswers')}
            </span>
          </Button>
        )}
        <Button variant="ghost" size="lg" fullWidth onClick={returnToHome}>
          {t('common.home')}
        </Button>
      </div>

      {/* Review Answers Modal */}
      <ReviewAnswersModal
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        questionHistory={questionHistory}
      />
    </motion.div>
  );
}

// ============================================
// Error Screen - Elegant
// ============================================
export function ErrorScreen() {
  const { t } = useTranslation();
  const { error, returnToHome } = useGameStore();

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-viewport no-x-overflow flex flex-col items-center justify-center px-4"
    >
      <div className="w-20 h-20 rounded-full bg-error/10 border border-error/30 flex items-center justify-center mb-6">
        <svg className="h-10 w-10 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 14.828a4 4 0 015.656 0M9 10h.01M15 10h.01M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        </svg>
      </div>
      <h2 className="font-heading font-bold text-2xl text-text-primary mb-2">{t('error.title')}</h2>
      <p className="text-text-secondary text-center mb-8 max-w-xs font-body">
        {error || t('error.defaultMessage')}
      </p>
      <Button variant="primary" size="lg" onClick={returnToHome}>
        {t('error.backToHome')}
      </Button>
    </motion.div>
  );
}
