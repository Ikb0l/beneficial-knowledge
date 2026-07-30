import { forwardRef, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { timerVariants, countdownPulseVariants } from '../../lib/animations/variants';

interface TimerProps {
  seconds: number;
  totalSeconds: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'circular' | 'linear' | 'bar';
  showPulse?: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
  onComplete?: () => void;
  className?: string;
}

const sizeConfig = {
  sm: { size: 48, strokeWidth: 3, fontSize: 'text-lg' },
  md: { size: 64, strokeWidth: 4, fontSize: 'text-2xl' },
  lg: { size: 80, strokeWidth: 5, fontSize: 'text-3xl' },
  xl: { size: 120, strokeWidth: 6, fontSize: 'text-5xl' },
};

function getTimerColor(seconds: number, warningThreshold: number, criticalThreshold: number): string {
  if (seconds <= criticalThreshold) return '#EF4444'; // Red
  if (seconds <= warningThreshold) return '#EAB308'; // Yellow
  return '#22C55E'; // Green
}

function getTimerState(seconds: number, warningThreshold: number, criticalThreshold: number): 'normal' | 'warning' | 'critical' {
  if (seconds <= criticalThreshold) return 'critical';
  if (seconds <= warningThreshold) return 'warning';
  return 'normal';
}

export const Timer = forwardRef<HTMLDivElement, TimerProps>(
  (
    {
      seconds,
      totalSeconds,
      size = 'md',
      variant = 'circular',
      showPulse = true,
      warningThreshold = 5,
      criticalThreshold = 3,
      onComplete,
      className,
    },
    ref
  ) => {
    const config = sizeConfig[size];
    const percentage = (seconds / totalSeconds) * 100;
    const color = getTimerColor(seconds, warningThreshold, criticalThreshold);
    const state = getTimerState(seconds, warningThreshold, criticalThreshold);
    const shouldPulse = showPulse && state !== 'normal';

    useEffect(() => {
      if (seconds === 0 && onComplete) {
        onComplete();
      }
    }, [seconds, onComplete]);

    // Timer bar variant (Beneficial Knowledge style - full width at top)
    if (variant === 'bar') {
      return (
        <div ref={ref} className={cn('w-full', className)}>
          <div className="timer-bar">
            <motion.div
              className={cn(
                'timer-bar-fill',
                state === 'normal' && 'safe',
                state === 'warning' && 'warning',
                state === 'critical' && 'danger'
              )}
              initial={{ width: '100%' }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.1, ease: 'linear' }}
            />
          </div>
        </div>
      );
    }

    // Linear variant with number
    if (variant === 'linear') {
      return (
        <div ref={ref} className={cn('w-full', className)}>
          <div className="flex justify-between items-center mb-1">
            <motion.span
              variants={timerVariants}
              animate={state}
              className={cn(
                'font-heading font-bold',
                config.fontSize
              )}
              style={{ color }}
            >
              {seconds}s
            </motion.span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: color }}
              initial={{ width: '100%' }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.1, ease: 'linear' }}
            />
          </div>
        </div>
      );
    }

    // Circular variant
    const radius = (config.size - config.strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <motion.div
        ref={ref}
        variants={timerVariants}
        animate={state}
        className={cn(
          'relative inline-flex items-center justify-center',
          shouldPulse && state === 'critical' && 'timer-danger',
          className
        )}
        style={{ width: config.size, height: config.size }}
      >
        <svg
          width={config.size}
          height={config.size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={config.strokeWidth}
          />
          {/* Progress circle */}
          <motion.circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.1, ease: 'linear' }}
            style={{
              strokeDasharray: circumference,
              filter: shouldPulse ? `drop-shadow(0 0 8px ${color})` : undefined,
            }}
          />
        </svg>

        {/* Center number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={seconds}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'font-heading font-bold',
                config.fontSize
              )}
              style={{ color }}
            >
              {seconds}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);

Timer.displayName = 'Timer';

// Countdown Component (for match start) - Beneficial Knowledge style dramatic countdown
interface CountdownProps {
  count?: number; // Initial count (defaults to 3)
  onComplete?: () => void;
  className?: string;
}

export const Countdown = forwardRef<HTMLDivElement, CountdownProps>(
  ({ count = 3, onComplete, className }, ref) => {
    const normalizedCount = Math.max(0, Math.floor(count));
    // Always start from the initial count value and run locally
    const [currentCount, setCurrentCount] = useState(() => normalizedCount);
    const hasCompletedRef = useRef(false);

    useEffect(() => {
      const resetTimer = setTimeout(() => {
        hasCompletedRef.current = false;
        setCurrentCount(normalizedCount);
      }, 0);
      return () => clearTimeout(resetTimer);
    }, [normalizedCount]);

    useEffect(() => {
      // When we drop below 0, GO! has been displayed long enough, trigger completion
      if (currentCount < 0) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete?.();
        }
        return;
      }

      // Timing for each stage:
      // 3, 2, 1: 1000ms each to match the server countdown
      // GO!: short flash before completing
      const displayDuration = currentCount <= 0 ? 300 : 1000;

      const timer = setTimeout(() => {
        setCurrentCount(prev => prev - 1);
      }, displayDuration);

      return () => clearTimeout(timer);
    }, [currentCount, onComplete]);

    // Show GO! when count is 0 or below (but not completed yet)
    const displayText = currentCount <= 0 ? 'GO!' : currentCount.toString();
    const isGo = currentCount <= 0;

    // Don't render anything after completion
    if (currentCount < 0) return null;

    return (
      <div ref={ref} className={cn('flex items-center justify-center', className)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCount}
            variants={countdownPulseVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'text-8xl font-score font-black',
              isGo ? 'text-accent-teal' : 'text-white'
            )}
            style={{
              textShadow: isGo
                ? '0 0 60px rgba(0, 212, 170, 0.9), 0 0 120px rgba(0, 212, 170, 0.5)'
                : '0 0 60px rgba(147, 51, 234, 0.8), 0 0 120px rgba(147, 51, 234, 0.4)',
            }}
          >
            {displayText}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }
);

Countdown.displayName = 'Countdown';

// Timer Bar Component (for Beneficial Knowledge style top timer)
interface TimerBarProps {
  seconds: number;
  totalSeconds: number;
  className?: string;
}

export const TimerBar = forwardRef<HTMLDivElement, TimerBarProps>(
  ({ seconds, totalSeconds, className }, ref) => {
    const percentage = (seconds / totalSeconds) * 100;
    const state = getTimerState(seconds, 5, 3);

    return (
      <div ref={ref} className={cn('w-full timer-bar', className)}>
        <motion.div
          className={cn(
            'timer-bar-fill',
            state === 'normal' && 'safe',
            state === 'warning' && 'warning',
            state === 'critical' && 'danger'
          )}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.1, ease: 'linear' }}
        />
      </div>
    );
  }
);

TimerBar.displayName = 'TimerBar';

// Elapsed Time Display
interface ElapsedTimeProps {
  seconds: number;
  className?: string;
}

export const ElapsedTime = forwardRef<HTMLDivElement, ElapsedTimeProps>(
  ({ seconds, className }, ref) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-1 font-mono text-text-secondary',
          className
        )}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {minutes}:{remainingSeconds.toString().padStart(2, '0')}
        </span>
      </div>
    );
  }
);

ElapsedTime.displayName = 'ElapsedTime';

export default Timer;
