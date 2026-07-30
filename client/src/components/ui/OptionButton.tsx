import { forwardRef, memo, useEffect, useState } from 'react';
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

type OptionState = 'default' | 'selected' | 'selectedYou' | 'selectedOpponent' | 'correct' | 'incorrect' | 'disabled' | 'spotlightCorrect' | 'spotlightDimmed' | 'userWrongFlash';
type OptionDensity = 'regular' | 'compact' | 'veryCompact';

interface OptionButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  label: string;
  letter: string;
  state?: OptionState;
  showUserMarker?: boolean;
  showOpponentMarker?: boolean;
  responseTime?: number;
  animationDelay?: number;
  variant?: 'default' | 'beneficialKnowledge' | 'premium' | 'reveal' | 'modernClassic';
  showSpotlight?: boolean;
  density?: OptionDensity;
  showLetterBadge?: boolean;
}

// Particle burst component for correct answers
const ParticleBurst = memo(function ParticleBurst() {
  const seeded01 = (seed: number) => {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
  };

  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i * 30) * (Math.PI / 180),
    distance: 40 + seeded01(100 + i * 1.7) * 30,
    size: 4 + seeded01(200 + i * 2.3) * 4,
    delay: seeded01(300 + i * 3.1) * 0.1,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute left-1/2 top-1/2 rounded-full bg-feedback-correct"
          style={{
            width: particle.size,
            height: particle.size,
            marginLeft: -particle.size / 2,
            marginTop: -particle.size / 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos(particle.angle) * particle.distance,
            y: Math.sin(particle.angle) * particle.distance,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 0.6,
            delay: particle.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
});

export const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(
  (
    {
      label,
      letter,
      state = 'default',
      showUserMarker = false,
      showOpponentMarker = false,
      responseTime,
      animationDelay = 0,
      variant = 'premium',
      showSpotlight = false,
      density = 'regular',
      showLetterBadge = true,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showParticles, setShowParticles] = useState(false);
    const isDisabled = disabled || state === 'disabled';
    const isSelected = state === 'selected' || state === 'selectedYou';
    const isSelectedOpponent = state === 'selectedOpponent';
    const isCorrect = state === 'correct' || state === 'spotlightCorrect';
    const isIncorrect = state === 'incorrect' || state === 'userWrongFlash';
    const isSpotlightCorrect = state === 'spotlightCorrect';
    const isSpotlightDimmed = state === 'spotlightDimmed';
    const isUserWrongFlash = state === 'userWrongFlash';
    const densityMinHeightClass =
      density === 'veryCompact'
        ? 'min-h-[70px] sm:min-h-[78px]'
        : density === 'compact'
          ? 'min-h-[80px] sm:min-h-[90px]'
          : 'min-h-[92px] sm:min-h-[104px]';
    const densityPaddingClass =
      density === 'veryCompact'
        ? 'p-3 sm:p-3.5'
        : density === 'compact'
          ? 'p-3.5 sm:p-4'
          : 'p-4 sm:p-5';
    const densityGapClass =
      density === 'veryCompact'
        ? 'gap-2.5'
        : density === 'compact'
          ? 'gap-3'
          : 'gap-4';
    const densityLetterClass =
      density === 'veryCompact'
        ? 'h-7 w-7 text-[11px]'
        : density === 'compact'
          ? 'h-7 w-7 text-[11px]'
          : 'h-8 w-8 text-xs';
    const densityMarkerContainerClass =
      density === 'veryCompact'
        ? 'bottom-2 right-2 gap-1'
        : density === 'compact'
          ? 'bottom-2.5 right-2.5 gap-1'
          : 'bottom-3 right-3 gap-1.5';
    const densityMarkerPillClass = density === 'veryCompact' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
    const densityResponseTimeClass =
      density === 'veryCompact'
        ? 'text-[10px] px-1.5 py-0.5'
        : density === 'compact'
          ? 'text-[10px] px-1.5 py-0.5'
          : 'text-[11px] px-2 py-0.5';

    // Trigger particles on correct answer
    useEffect(() => {
      if (!isCorrect) {
        const resetTimer = setTimeout(() => setShowParticles(false), 0);
        return () => clearTimeout(resetTimer);
      }

      const showTimer = setTimeout(() => setShowParticles(true), 0);
      const hideTimer = setTimeout(() => setShowParticles(false), 800);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }, [isCorrect]);

    // Adaptive font sizing with tighter range for consistent cross-device density.
    const getAdaptiveFontClass = (text: string) => {
      if (density === 'veryCompact') {
        if (text.length < 24) return 'text-lg';
        if (text.length < 50) return 'text-base';
        return 'text-sm';
      }

      if (density === 'compact') {
        if (text.length < 28) return 'text-lg sm:text-xl';
        if (text.length < 56) return 'text-base sm:text-lg';
        return 'text-sm sm:text-base';
      }

      if (text.length < 28) return 'text-xl sm:text-2xl';
      if (text.length < 56) return 'text-lg sm:text-xl';
      return 'text-base sm:text-lg';
    };

    const labelLayoutClass = showLetterBadge ? 'flex-1 text-left' : 'w-full text-center';

    // Premium variant (new design)
    if (variant === 'premium') {
      return (
        <motion.button
          ref={ref}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: isSelected ? 0.995 : 1,
            transition: { delay: animationDelay, duration: 0.22, ease: [0.4, 0, 0.2, 1] }
          }}
          whileHover={!isDisabled ? {
            scale: 1.008,
            y: -1,
            transition: { duration: 0.12 }
          } : undefined}
          whileTap={!isDisabled ? { scale: 0.99 } : undefined}
          disabled={isDisabled}
          className={cn(
            'relative w-full flex items-center',
            'rounded-2xl transition-all duration-150',
            'touch-feedback no-select',
            densityGapClass,
            densityMinHeightClass,
            densityPaddingClass,
            'overflow-hidden',
            // Default state
            !isSelected && !isSelectedOpponent && !isCorrect && !isIncorrect && [
              'bg-[#111A2E]',
              'border border-[#2A3A5F]',
              'hover:bg-[#16223A] hover:border-[#35507d]',
            ],
            // Selected state
            isSelected && [
              'bg-[#1E3A8A]/25',
              'border-2 border-[#3B82F6]',
            ],
            // Opponent selected
            isSelectedOpponent && [
              'bg-[#92400E]/20',
              'border-2 border-[#F59E0B]/80',
            ],
            // Correct state
            isCorrect && [
              'bg-[#14532D]/35',
              'border-2 border-[#16A34A]',
            ],
            // Incorrect state
            isIncorrect && [
              'bg-[#7F1D1D]/35',
              'border-2 border-[#DC2626]',
              'animate-shake',
            ],
            // Disabled state
            isDisabled && !isCorrect && !isIncorrect && !isSelected && 'opacity-55',
            className
          )}
          style={{
            boxShadow: isCorrect || isIncorrect || isSelected
              ? '0 10px 24px rgba(2, 6, 23, 0.36)'
              : '0 6px 16px rgba(2, 6, 23, 0.22)',
          }}
          {...props}
        >
          {showLetterBadge && (
            <span
              className={cn(
                'relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-bold',
                densityLetterClass,
                !isSelected && !isSelectedOpponent && !isCorrect && !isIncorrect && 'bg-[#1B2A44] text-[#C8D5F0]',
                isSelected && 'bg-[#3B82F6] text-white',
                isSelectedOpponent && 'bg-[#F59E0B] text-[#111827]',
                isCorrect && 'bg-[#16A34A] text-white',
                isIncorrect && 'bg-[#DC2626] text-white'
              )}
            >
              {letter}
            </span>
          )}

          {/* Answer text */}
          <span className={cn(
            'relative z-10 font-medium leading-snug font-answer',
            labelLayoutClass,
            getAdaptiveFontClass(label),
            'text-[#F3F6FF]'
          )}>
            {label}
          </span>

          {/* Markers container */}
          <div className={cn('absolute flex items-center z-10', densityMarkerContainerClass)}>
            {/* Response time */}
            <AnimatePresence>
              {responseTime !== undefined && (isCorrect || isIncorrect) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={cn('font-mono bg-black/35 rounded-full text-white/80', densityResponseTimeClass)}
                >
                  {responseTime.toFixed(1)}s
                </motion.span>
              )}
            </AnimatePresence>

            {/* User marker */}
            <AnimatePresence>
              {showUserMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-[#3B82F6] text-white'
                  )}
                >
                  YOU
                </motion.span>
              )}
            </AnimatePresence>

            {/* Opponent marker */}
            <AnimatePresence>
              {showOpponentMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-[#F59E0B] text-[#111827]'
                  )}
                >
                  OPP
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {showParticles && <ParticleBurst />}
          </AnimatePresence>
        </motion.button>
      );
    }

    if (variant === 'modernClassic') {
      return (
        <motion.button
          ref={ref}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{
            opacity: isSpotlightDimmed ? 0.45 : 1,
            y: 0,
            scale: isSelected ? 0.995 : 1,
            filter: isSpotlightDimmed ? 'saturate(70%)' : 'none',
            transition: { delay: animationDelay, duration: 0.24, ease: [0.4, 0, 0.2, 1] },
          }}
          whileHover={!isDisabled && !isSpotlightDimmed ? { scale: 1.01, y: -1 } : undefined}
          whileTap={!isDisabled ? { scale: 0.99 } : undefined}
          disabled={isDisabled}
          className={cn(
            'relative w-full flex items-center overflow-hidden touch-feedback no-select transition-all duration-150',
            'rounded-xl',
            densityGapClass,
            densityMinHeightClass,
            densityPaddingClass,
            !isSelected && !isSelectedOpponent && !isCorrect && !isIncorrect && 'bg-white border border-[#D0D6DE]',
            isSelected && 'bg-white border-2 border-[#06B6D4] ring-2 ring-[#06B6D4]/30',
            isSelectedOpponent && 'bg-white border-2 border-[#F59E0B] ring-2 ring-[#F59E0B]/30',
            isCorrect && 'bg-[#0E4A31] border-2 border-[#16A34A] ring-2 ring-[#22C55E]/45',
            isIncorrect && 'bg-[#5B1420] border-2 border-[#DC2626] ring-2 ring-[#EF4444]/45',
            isUserWrongFlash && 'animate-shake',
            isDisabled && !isCorrect && !isIncorrect && !isSelected && 'opacity-80',
            className
          )}
          style={{
            boxShadow: isCorrect || isIncorrect || isSelected
              ? '0 12px 22px rgba(2, 6, 23, 0.22)'
              : '0 8px 18px rgba(2, 6, 23, 0.16)',
          }}
          {...props}
        >
          {showLetterBadge && (
            <span
              className={cn(
                'relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-bold',
                densityLetterClass,
                !isSelected && !isSelectedOpponent && !isCorrect && !isIncorrect && 'bg-[#111827] text-white',
                isSelected && 'bg-[#06B6D4] text-white',
                isSelectedOpponent && 'bg-[#F59E0B] text-[#111827]',
                isCorrect && 'bg-[#16A34A] text-white',
                isIncorrect && 'bg-[#DC2626] text-white'
              )}
            >
              {letter}
            </span>
          )}

          <span
            className={cn(
              'relative z-10 font-semibold leading-snug font-answer',
              labelLayoutClass,
              getAdaptiveFontClass(label),
              isCorrect || isIncorrect ? 'text-white' : 'text-[#111827]'
            )}
          >
            {label}
          </span>

          <div className={cn('absolute flex items-center z-10', densityMarkerContainerClass)}>
            <AnimatePresence>
              {responseTime !== undefined && (isCorrect || isIncorrect) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={cn('font-mono bg-white/20 rounded-full text-white/90', densityResponseTimeClass)}
                >
                  {responseTime.toFixed(1)}s
                </motion.span>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showUserMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-[#06B6D4] text-white'
                  )}
                >
                  YOU
                </motion.span>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showOpponentMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-[#F59E0B] text-[#111827]'
                  )}
                >
                  OPP
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {isSpotlightCorrect && showSpotlight && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              animate={{
                boxShadow: [
                  'inset 0 0 0 rgba(34,197,94,0)',
                  'inset 0 0 36px rgba(34,197,94,0.34)',
                  'inset 0 0 0 rgba(34,197,94,0)',
                ],
              }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.button>
      );
    }

    // Reveal variant - Dramatic spotlight reveal for answer results
    if (variant === 'reveal') {
      return (
        <motion.button
          ref={ref}
          initial={{ opacity: 1, scale: 1 }}
          animate={{
            opacity: isSpotlightDimmed ? 0.25 : 1,
            scale: isSpotlightDimmed ? 0.98 : 1,
            filter: isSpotlightDimmed ? 'grayscale(40%) brightness(0.6)' : 'none',
            transition: { duration: 0.4, ease: 'easeOut' }
          }}
          disabled={true}
          className={cn(
            'relative w-full flex items-center',
            'rounded-2xl transition-all duration-200',
            'no-select',
            densityGapClass,
            densityMinHeightClass,
            densityPaddingClass,
            'overflow-hidden',
            // Spotlight correct state
            isSpotlightCorrect && [
              'bg-[#0E4A31]',
              'border-2 border-[#16A34A]',
            ],
            // User wrong flash state
            isUserWrongFlash && [
              'bg-[#5B1420]',
              'border-2 border-[#DC2626]',
              'user-wrong-flash',
            ],
            // Dimmed state for wrong answers
            isSpotlightDimmed && [
              'bg-[#0b1020]',
              'border border-[#1E293B]',
            ],
            // Default reveal state
            !isSpotlightCorrect && !isSpotlightDimmed && !isUserWrongFlash && [
              'bg-[#111A2E]',
              'border border-[#2A3A5F]',
            ],
            className
          )}
          style={{
            boxShadow: isSpotlightCorrect
              ? '0 12px 26px rgba(22, 163, 74, 0.28)'
              : isUserWrongFlash
              ? '0 12px 26px rgba(220, 38, 38, 0.24)'
              : '0 6px 14px rgba(2, 6, 23, 0.22)',
          }}
          {...props}
        >
          {/* Spotlight beam effect for correct answer */}
          {isSpotlightCorrect && showSpotlight && (
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Main spotlight beam */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: '-150%',
                  width: '200%',
                  height: '300%',
                  background: `linear-gradient(180deg, rgba(34, 197, 94, 0) 0%, rgba(34, 197, 94, 0.1) 30%, rgba(34, 197, 94, 0.2) 50%, rgba(34, 197, 94, 0.1) 70%, rgba(34, 197, 94, 0) 100%)`,
                  clipPath: 'polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)',
                }}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              />
              {/* Pulsing glow */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                animate={{
                  boxShadow: [
                    'inset 0 0 20px rgba(34, 197, 94, 0.2)',
                    'inset 0 0 40px rgba(34, 197, 94, 0.4)',
                    'inset 0 0 20px rgba(34, 197, 94, 0.2)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          )}

          {showLetterBadge && (
            <span
              className={cn(
                'relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-bold',
                densityLetterClass,
                isSpotlightCorrect && 'bg-[#16A34A] text-white',
                isUserWrongFlash && 'bg-[#DC2626] text-white',
                isSpotlightDimmed && 'bg-[#1E293B] text-[#94A3B8]',
                !isSpotlightCorrect && !isSpotlightDimmed && !isUserWrongFlash && 'bg-[#1B2A44] text-[#C8D5F0]'
              )}
            >
              {letter}
            </span>
          )}

          {/* Answer text */}
          <span className={cn(
            'relative z-10 font-medium leading-snug font-answer',
            labelLayoutClass,
            getAdaptiveFontClass(label),
            isSpotlightCorrect && 'text-white',
            isUserWrongFlash && 'text-white',
            isSpotlightDimmed && 'text-white/30',
            !isSpotlightCorrect && !isSpotlightDimmed && !isUserWrongFlash && 'text-[#F3F6FF]'
          )}>
            {label}
          </span>

          {/* Markers container */}
          <div className={cn('absolute flex items-center z-10', densityMarkerContainerClass)}>
            {/* Response time */}
            <AnimatePresence>
              {responseTime !== undefined && (isSpotlightCorrect || isUserWrongFlash) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={cn('font-mono bg-black/35 rounded-full text-white/80', densityResponseTimeClass)}
                >
                  {responseTime.toFixed(1)}s
                </motion.span>
              )}
            </AnimatePresence>

            {/* User marker */}
            <AnimatePresence>
              {showUserMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isSpotlightCorrect ? 'bg-green-500/30 text-green-200' :
                    isUserWrongFlash ? 'bg-red-500/30 text-red-200' :
                    'bg-[#3B82F6]/25 text-[#BFDBFE]'
                  )}
                >
                  YOU
                </motion.span>
              )}
            </AnimatePresence>

            {/* Opponent marker */}
            <AnimatePresence>
              {showOpponentMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={cn(
                    'rounded-full font-bold',
                    densityMarkerPillClass,
                    isSpotlightCorrect ? 'bg-green-500/30 text-green-200' :
                    isUserWrongFlash ? 'bg-red-500/30 text-red-200' :
                    'bg-[#F59E0B]/25 text-[#FDE68A]'
                  )}
                >
                  OPP
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {showParticles && <ParticleBurst />}
          </AnimatePresence>
        </motion.button>
      );
    }

    // Beneficial Knowledge-style white card button (legacy)
    if (variant === 'beneficialKnowledge') {
      return (
        <motion.button
          ref={ref}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: isSelected ? 0.97 : 1,
            transition: { delay: animationDelay, duration: 0.3, ease: [0.4, 0, 0.2, 1] }
          }}
          whileHover={!isDisabled ? { scale: 1.02, y: -2 } : undefined}
          whileTap={!isDisabled ? { scale: 0.97 } : undefined}
          disabled={isDisabled}
          className={cn(
            'relative w-full flex items-center justify-center',
            'rounded-xl transition-all duration-200',
            'touch-feedback no-select font-semibold',
            getAdaptiveFontClass(label),
            'min-h-[clamp(96px,18vw,150px)] p-[clamp(14px,4vw,24px)]',
            !isSelected && !isSelectedOpponent && !isCorrect && !isIncorrect && 'bg-white text-gray-900',
            isSelected && 'bg-accent-teal text-white ring-4 ring-accent-teal/50 scale-[0.97]',
            isSelectedOpponent && 'bg-accent-orange/20 text-gray-900 ring-4 ring-accent-orange/50',
            isCorrect && 'bg-feedback-correct text-white ring-4 ring-feedback-correct/50',
            isIncorrect && 'bg-feedback-wrong text-white ring-4 ring-feedback-wrong/50 animate-shake',
            isDisabled && !isCorrect && !isIncorrect && !isSelected && 'opacity-50',
            className
          )}
          {...props}
        >
          <AnimatePresence>
            {(isCorrect || isIncorrect) && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="absolute top-2 right-2"
              >
                {isCorrect ? (
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <span className="text-center leading-snug px-2 font-answer">{label}</span>

          <div className="absolute bottom-3 right-3 flex items-center gap-1">
            <AnimatePresence>
              {responseTime !== undefined && (isCorrect || isIncorrect) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-sm font-mono bg-black/20 px-2.5 py-1 rounded-full text-white"
                >
                  {responseTime.toFixed(1)}s
                </motion.span>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showUserMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-sm font-bold',
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-accent-teal text-white'
                  )}
                >
                  YOU
                </motion.span>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showOpponentMarker && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-sm font-bold',
                    isCorrect || isIncorrect ? 'bg-white/20 text-white' : 'bg-accent-orange text-white'
                  )}
                >
                  OPP
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {isSelected && (
            <motion.div
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 rounded-2xl bg-accent-teal/30"
            />
          )}
        </motion.button>
      );
    }

    // Default variant (legacy)
    return (
      <motion.button
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={!isDisabled ? { scale: 1.02 } : undefined}
        whileTap={!isDisabled ? { scale: 0.98 } : undefined}
        transition={{ delay: animationDelay, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        disabled={isDisabled}
        className={cn(
          'relative w-full flex items-center gap-4 p-5 rounded-xl',
          'text-left transition-all duration-250',
          'touch-feedback no-select font-body',
          'bg-bg-card/80 border-2 border-white/10',
          isSelected && 'border-accent-teal bg-accent-teal/15 shadow-glow-teal',
          isSelectedOpponent && 'border-accent-orange bg-accent-orange/10 shadow-glow-orange',
          isCorrect && 'border-feedback-correct bg-feedback-correct/20 shadow-glow-correct',
          isIncorrect && 'border-feedback-wrong bg-feedback-wrong/20 shadow-glow-wrong animate-shake',
          isDisabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {showLetterBadge && (
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
              'font-heading font-semibold text-lg transition-all duration-250',
              !isCorrect && !isIncorrect && !isSelected && !isSelectedOpponent && 'bg-white/20 text-white',
              isSelected && 'bg-accent-teal text-bg-primary',
              isSelectedOpponent && 'bg-accent-orange text-bg-primary',
              isCorrect && 'bg-feedback-correct text-white',
              isIncorrect && 'bg-feedback-wrong text-white'
            )}
          >
            {isCorrect ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : isIncorrect ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              letter
            )}
          </div>
        )}
        <span className={cn('font-medium text-text-primary text-xl font-answer', labelLayoutClass)}>{label}</span>
      </motion.button>
    );
  }
);

OptionButton.displayName = 'OptionButton';

// Beneficial Knowledge-style 2x2 Options Grid Component
interface OptionsGridProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'beneficialKnowledge' | 'premium';
}

export const OptionsGrid = forwardRef<HTMLDivElement, OptionsGridProps>(
  ({ children, className, variant = 'premium' }, ref) => {
    if (variant === 'beneficialKnowledge' || variant === 'premium') {
      return (
        <motion.div
          ref={ref}
          initial="initial"
          animate="animate"
          className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', className)}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <motion.div
        ref={ref}
        initial="initial"
        animate="animate"
        className={cn('flex flex-col gap-2', className)}
      >
        {children}
      </motion.div>
    );
  }
);

OptionsGrid.displayName = 'OptionsGrid';

export default OptionButton;


