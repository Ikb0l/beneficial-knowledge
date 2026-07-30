import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

export type TimerRailState = 'safe' | 'warning' | 'danger';

interface TimerRailsProps {
  progress: number;
  state?: TimerRailState;
  pulse?: boolean;
  compact?: boolean;
  veryCompact?: boolean;
  className?: string;
}

// ── Color themes ────────────────────────────────────────────
const THEME = {
  safe: {
    main: '#20c5ff',
    mainEnd: '#0ea5e9',
    glow: 'rgba(32, 197, 255, 0.55)',
    glowStrong: 'rgba(32, 197, 255, 0.8)',
    bg: 'rgba(32, 197, 255, 0.12)',
    rail: 'rgba(255, 255, 255, 0.08)',
  },
  warning: {
    main: '#f59e0b',
    mainEnd: '#d97706',
    glow: 'rgba(245, 158, 11, 0.5)',
    glowStrong: 'rgba(251, 191, 36, 0.75)',
    bg: 'rgba(245, 158, 11, 0.12)',
    rail: 'rgba(255, 255, 255, 0.08)',
  },
  danger: {
    main: '#ef4444',
    mainEnd: '#dc2626',
    glow: 'rgba(239, 68, 68, 0.6)',
    glowStrong: 'rgba(252, 129, 129, 0.85)',
    bg: 'rgba(239, 68, 68, 0.18)',
    rail: 'rgba(255, 255, 255, 0.06)',
  },
} as const;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ── Shimmer grain particles ─────────────────────────────────
const SHIMMER_PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  delay: i * 0.3 + Math.random() * 0.2,
  x: 10 + i * 16,
}));

// ── Waveform segments for the urgency rail ──────────────────
const WAVEFORM_SEGMENTS = 24;

export const TimerRails = memo(function TimerRails({
  progress,
  state = 'safe',
  pulse = false,
  compact = false,
  veryCompact = false,
  className,
}: TimerRailsProps) {
  const p = useMemo(() => clamp01(progress), [progress]);
  const t = THEME[state];
  const isDanger = state === 'danger';
  const isWarning = state === 'warning';
  const shouldPulse = pulse || isDanger;

  // ── Sizing ──────────────────────────────────────────────
  const mainHeight = veryCompact ? 6 : compact ? 7 : 8;
  const railHeight = veryCompact ? 3 : 4;
  const gap = veryCompact ? 3 : 4;
  const borderRadius = veryCompact ? 3 : 4;
  const px = veryCompact ? 'px-0' : '';

  // ── Waveform segment jitter ─────────────────────────────
  const waveformSegments = useMemo(() => {
    return Array.from({ length: WAVEFORM_SEGMENTS }, (_, i) => {
      const baseAmp = isDanger ? 1 : isWarning ? 0.55 : 0.25;
      const urgency = 1 - p; // 0 = full time, 1 = no time
      return {
        id: i,
        delay: i * 0.04,
        amplitude: baseAmp + urgency * 1.2,
        frequency: 0.8 + urgency * 2.5,
      };
    });
  }, [p, isDanger, isWarning]);

  return (
    <div
      className={cn(
        'pointer-events-none w-full z-[25]',
        px,
        className,
      )}
      style={{ paddingBottom: gap + railHeight }}
    >
      {/* ═══════════════════════════════════════════════════════
          TOP BAR — Main Time Progress
          ═══════════════════════════════════════════════════════ */}
      <motion.div
        className="relative w-full overflow-hidden"
        style={{
          height: mainHeight,
          borderRadius,
          background: t.rail,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)`,
        }}
        animate={isDanger ? { x: [0, -1.5, 1.5, -1, 1, 0] } : {}}
        transition={
          isDanger
            ? { duration: 0.25, repeat: Infinity, ease: 'easeInOut' }
            : {}
        }
      >
        {/* Background track shimmer */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${t.main}22 30%, transparent 60%)`,
          }}
        />

        {/* Main progress fill */}
        <motion.div
          className="absolute inset-y-0 left-0 origin-left"
          style={{
            borderRadius,
            background: `linear-gradient(90deg, ${t.main} 0%, ${t.mainEnd} 100%)`,
            boxShadow: `0 0 12px ${t.glow}, 0 0 24px ${t.glow}`,
          }}
          initial={false}
          animate={{
            scaleX: p,
            opacity: p > 0 ? 1 : 0,
          }}
          transition={{
            scaleX: { duration: 0.08, ease: 'linear' },
            opacity: { duration: 0.12 },
          }}
        >
          {/* Inner gloss highlight */}
          <div
            className="absolute inset-x-0 top-0 h-[35%]"
            style={{
              borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, transparent 100%)',
            }}
          />

          {/* Leading edge glow cursor */}
          <motion.div
            className="absolute right-0 inset-y-0 w-[3px]"
            style={{
              background: t.glowStrong,
              boxShadow: `0 0 10px ${t.glowStrong}, 0 0 20px ${t.glowStrong}, 0 0 40px ${t.glow}`,
              borderRadius: '0 2px 2px 0',
            }}
            animate={
              shouldPulse
                ? { opacity: [0.7, 1, 0.7] }
                : { opacity: 0.9 }
            }
            transition={
              shouldPulse
                ? { duration: isDanger ? 0.35 : 0.7, repeat: Infinity }
                : {}
            }
          />
        </motion.div>

        {/* Shimmer sweep across the fill */}
        <motion.div
          className="absolute inset-y-0"
          style={{
            width: '30%',
            background: `linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.2) 60%, transparent 100%)`,
            filter: 'blur(1px)',
          }}
          initial={false}
          animate={{
            left: p > 0.05 ? ['-30%', '105%'] : '-30%',
            opacity: p > 0.05 ? 1 : 0,
          }}
          transition={{
            left: {
              duration: isDanger ? 0.6 : 1.5,
              repeat: Infinity,
              ease: 'linear',
              delay: 0.15,
            },
          }}
        />

        {/* Danger: trailing particles behind the edge */}
        {isDanger &&
          SHIMMER_PARTICLES.map((pt) => (
            <motion.div
              key={pt.id}
              className="absolute top-0 bottom-0 w-[2px] rounded-full"
              style={{
                background: t.glowStrong,
                boxShadow: `0 0 6px ${t.glowStrong}`,
              }}
              initial={false}
              animate={{
                left: `${p * 100}%`,
                opacity: [0, 0.8, 0],
                x: [0, -12 - pt.id * 5, -24 - pt.id * 6],
              }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                delay: pt.delay,
                ease: 'easeOut',
              }}
            />
          ))}

        {/* Pulse overlay for danger / warning */}
        {(shouldPulse) && (
          <motion.div
            className="absolute inset-0"
            style={{
              borderRadius,
              background: t.glow,
            }}
            animate={{ opacity: [0, 0.25, 0] }}
            transition={{
              duration: isDanger ? 0.4 : 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════
          BOTTOM BAR — Urgency Waveform Rail
          ═══════════════════════════════════════════════════════ */}
      <div
        className="relative w-full flex items-end"
        style={{
          height: railHeight,
          marginTop: gap,
          gap: 1,
        }}
      >
        {/* Rail background */}
        <div
          className="absolute inset-0 flex items-end"
          style={{ gap: 1 }}
        >
          {waveformSegments.map((seg) => (
            <motion.div
              key={seg.id}
              className="flex-1 rounded-full"
              style={{
                background: t.main,
                boxShadow: `0 0 4px ${t.glow}`,
              }}
              initial={false}
              animate={{
                height: [
                  `${Math.max(30, seg.amplitude * 35)}%`,
                  `${Math.max(30, seg.amplitude * 85)}%`,
                  `${Math.max(30, seg.amplitude * 50)}%`,
                  `${Math.max(30, seg.amplitude * 95)}%`,
                  `${Math.max(30, seg.amplitude * 35)}%`,
                ],
                opacity: [
                  0.3,
                  1,
                  0.5,
                  0.9,
                  0.3,
                ],
              }}
              transition={{
                duration: 0.6 / seg.frequency,
                repeat: Infinity,
                delay: seg.delay,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* Progress-based dimming — right side fades as time depletes */}
        <motion.div
          className="absolute inset-y-0 right-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(15,23,42,0.85) 100%)`,
            borderRadius: '0 2px 2px 0',
          }}
          initial={false}
          animate={{
            width: `${(1 - p) * 100}%`,
          }}
          transition={{
            width: { duration: 0.08, ease: 'linear' },
          }}
        />
      </div>
    </div>
  );
});

export default TimerRails;
