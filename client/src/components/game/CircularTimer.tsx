import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface CircularTimerProps {
  timeLeft: number;
  totalTime: number;
  size?: number;
  strokeWidth?: number;
  showGlow?: boolean;
  className?: string;
}

export const CircularTimer = memo(function CircularTimer({
  timeLeft,
  totalTime,
  size = 80,
  strokeWidth = 6,
  showGlow = true,
  className,
}: CircularTimerProps) {
  const safeTotalTime = Math.max(1, totalTime);
  const clampedTimeLeft = Math.max(0, Math.min(timeLeft, safeTotalTime));
  const percentage = Math.max(0, Math.min(100, (clampedTimeLeft / safeTotalTime) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color states based on time
  const colorState = useMemo(() => {
    if (clampedTimeLeft <= 3) return 'danger';
    if (clampedTimeLeft <= 5) return 'warning';
    return 'safe';
  }, [clampedTimeLeft]);

  const colors = {
    safe: {
      primary: '#20c5ff',
      secondary: '#15a7e0',
      glow: 'rgba(32, 197, 255, 0.42)',
      bg: 'rgba(32, 197, 255, 0.12)',
    },
    warning: {
      primary: '#f59e0b',
      secondary: '#d97706',
      glow: 'rgba(245, 158, 11, 0.4)',
      bg: 'rgba(245, 158, 11, 0.1)',
    },
    danger: {
      primary: '#ef4444',
      secondary: '#dc2626',
      glow: 'rgba(239, 68, 68, 0.5)',
      bg: 'rgba(239, 68, 68, 0.15)',
    },
  };

  const currentColor = colors[colorState];

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Background glow */}
      {showGlow && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size + 20,
            height: size + 20,
            background: `radial-gradient(circle, ${currentColor.glow} 0%, transparent 70%)`,
          }}
          animate={
            colorState === 'danger'
              ? { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }
              : colorState === 'warning'
              ? { scale: [1, 1.08, 1], opacity: [0.7, 0.9, 0.7] }
              : { opacity: [0.5, 0.7, 0.5] }
          }
          transition={{
            duration: colorState === 'danger' ? 0.3 : colorState === 'warning' ? 0.8 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* SVG Timer Ring */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background ring (depleted portion) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />

        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#timerGradient-${colorState})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            filter: `drop-shadow(0 0 8px ${currentColor.glow})`,
            transition: 'stroke-dashoffset 0.1s linear',
          }}
        />

        {/* Gradient definitions */}
        <defs>
          <linearGradient id="timerGradient-safe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#20c5ff" />
            <stop offset="100%" stopColor="#15a7e0" />
          </linearGradient>
          <linearGradient id="timerGradient-warning" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="timerGradient-danger" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center number */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={
          colorState === 'danger'
            ? { scale: [1, 1.1, 1] }
            : colorState === 'warning'
            ? { scale: [1, 1.05, 1] }
            : {}
        }
        transition={{
          duration: colorState === 'danger' ? 0.3 : 0.8,
          repeat: colorState !== 'safe' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <motion.span
          className={cn(
            'font-score font-black tabular-nums',
            size >= 80 ? 'text-3xl' : size >= 60 ? 'text-2xl' : 'text-xl'
          )}
          style={{
            color: currentColor.primary,
            textShadow: `0 0 20px ${currentColor.glow}`,
          }}
          animate={
            colorState === 'danger' && timeLeft <= 3
              ? { x: [-2, 2, -2, 2, 0] }
              : {}
          }
          transition={{
            duration: 0.4,
            repeat: colorState === 'danger' ? Infinity : 0,
          }}
        >
          {timeLeft}
        </motion.span>
      </motion.div>

      {/* Flash effect when time changes */}
      <AnimatePresence>
        {colorState === 'danger' && timeLeft <= 3 && (
          <motion.div
            key={timeLeft}
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: currentColor.glow }}
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 1.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default CircularTimer;
