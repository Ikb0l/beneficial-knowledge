import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

export type SideTimerState = 'safe' | 'warning' | 'danger';

interface SideTimerRailsProps {
  progress: number;
  state?: SideTimerState;
  pulse?: boolean;
  compact?: boolean;
  veryCompact?: boolean;
  className?: string;
}

// ── Premium color themes ────────────────────────────────────
const THEME: Record<SideTimerState, {
  neon: string;
  neonEnd: string;
  glow: string;
  glowIntense: string;
  surface: string;
  railBg: string;
  railBorder: string;
  railGlow: string;
  tickColor: string;
  particle: string;
}> = {
  safe: {
    neon: '#22d3ee',
    neonEnd: '#06b6d4',
    glow: 'rgba(34, 211, 238, 0.4)',
    glowIntense: 'rgba(34, 211, 238, 0.8)',
    surface: 'rgba(165, 243, 252, 0.9)',
    railBg: 'rgba(15, 23, 42, 0.85)',
    railBorder: 'rgba(71, 85, 105, 0.35)',
    railGlow: 'rgba(34, 211, 238, 0.08)',
    tickColor: 'rgba(148, 163, 184, 0.25)',
    particle: '#67e8f9',
  },
  warning: {
    neon: '#fbbf24',
    neonEnd: '#f59e0b',
    glow: 'rgba(251, 191, 36, 0.45)',
    glowIntense: 'rgba(251, 191, 36, 0.85)',
    surface: 'rgba(253, 230, 138, 0.9)',
    railBg: 'rgba(15, 23, 42, 0.85)',
    railBorder: 'rgba(120, 100, 60, 0.4)',
    railGlow: 'rgba(251, 191, 36, 0.1)',
    tickColor: 'rgba(180, 160, 100, 0.3)',
    particle: '#fcd34d',
  },
  danger: {
    neon: '#f87171',
    neonEnd: '#ef4444',
    glow: 'rgba(248, 113, 113, 0.5)',
    glowIntense: 'rgba(252, 129, 129, 0.9)',
    surface: 'rgba(254, 202, 202, 0.95)',
    railBg: 'rgba(15, 23, 42, 0.88)',
    railBorder: 'rgba(140, 70, 70, 0.45)',
    railGlow: 'rgba(248, 113, 113, 0.13)',
    tickColor: 'rgba(200, 130, 130, 0.3)',
    particle: '#fca5a5',
  },
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ── Tick mark positions ─────────────────────────────────────
const TICK_COUNT = 8;

// ── Floating particles ──────────────────────────────────────
const PARTICLES = Array.from({ length: 5 }, (_, i) => ({
  id: i,
  offset: 15 + i * 18,   // % from bottom
  delay: i * 0.6,
  size: 3 + (i % 3),
}));

export const SideTimerRails = memo(function SideTimerRails({
  progress,
  state = 'safe',
  pulse = false,
  compact = false,
  veryCompact = false,
  className,
}: SideTimerRailsProps) {
  const p = useMemo(() => clamp01(progress), [progress]);
  const t = THEME[state];
  const isDanger = state === 'danger';
  const isWarning = state === 'warning';
  const shouldPulse = pulse || isDanger;
  const hasFill = p > 0.005;

  // ── Sizing ──────────────────────────────────────────────
  const railW = veryCompact ? 20 : compact ? 24 : 28;        // rail total width

  const railH = veryCompact ? '88%' : compact ? '91%' : '93%';
  const sideOffset = veryCompact ? 6 : compact ? 8 : 10;

  // ── Tick marks ─────────────────────────────────────────
  const ticks = useMemo(() =>
    Array.from({ length: TICK_COUNT }, (_, i) => ({
      id: i,
      pos: 8 + i * 10.5, // % from bottom
    })),
  []);

  // ── Liquid surface wave ─────────────────────────────────
  const wavePath = useMemo(() => {
    if (!hasFill) return '';
    const h = p * 100; // fill height %
    const amp = isDanger ? 3.5 : isWarning ? 2 : 1.2;
    const y0 = 100 - h;
    return `M0,${y0 + amp} Q25,${y0 - amp * 1.8} 50,${y0 + amp * 0.6} T100,${y0 - amp * 0.3} L100,100 L0,100 Z`;
  }, [p, isDanger, isWarning, hasFill]);

  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={cn(
            'pointer-events-none absolute top-0 bottom-0 z-[25] flex items-center',
            side === 'left' ? '' : '',
            className,
          )}
          style={{
            [side]: sideOffset,
            width: railW,
          }}
        >
          {/* ═══════════════════════════════════════════════════
              OUTER RAIL — Glass tube
              ════════════════════════════════════════════════ */}
          <div
            className="relative w-full overflow-hidden"
            style={{
              height: railH,
              borderRadius: railW,
              background: `linear-gradient(180deg, ${t.railBg} 0%, rgba(30,41,59,0.9) 100%)`,
              border: `1.5px solid ${t.railBorder}`,
              boxShadow: `
                inset 0 2px 8px rgba(0,0,0,0.5),
                inset 0 -2px 4px rgba(255,255,255,0.03),
                0 0 20px ${t.railGlow},
                0 4px 16px rgba(0,0,0,0.4)
              `,
            }}
          >
            {/* Inner glass highlight — left edge */}
            <div
              className="absolute inset-y-[4px] left-[2px] rounded-full opacity-30"
              style={{
                width: railW * 0.22,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
              }}
            />

            {/* Inner glass highlight — right edge */}
            <div
              className="absolute inset-y-[4px] right-[2px] rounded-full opacity-15"
              style={{
                width: railW * 0.18,
                background: 'linear-gradient(270deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
              }}
            />

            {/* Tick marks */}
            {ticks.map((tick) => (
              <div
                key={tick.id}
                className="absolute left-0 right-0 mx-auto"
                style={{
                  bottom: `${tick.pos}%`,
                  width: '70%',
                  height: 1,
                  background: t.tickColor,
                  borderRadius: 1,
                }}
              />
            ))}

            {/* ═══════════════════════════════════════════════
                NEON FILL — Liquid with glowing surface
                ════════════════════════════════════════════ */}
            <motion.div
              className="absolute inset-x-0 bottom-0 overflow-hidden"
              style={{ borderRadius: railW }}
              initial={false}
              animate={{ height: `${p * 100}%` }}
              transition={{ height: { duration: 0.08, ease: 'linear' } }}
            >
              {/* Main fill gradient */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${t.neon} 0%, ${t.neonEnd} 60%, ${t.glowIntense} 100%)`,
                  boxShadow: `inset 0 2px 8px rgba(255,255,255,0.3), 0 0 20px ${t.glow}`,
                }}
              />

              {/* SVG liquid surface wave */}
              {hasFill && (
                <svg
                  className="absolute inset-x-0 top-0 w-full overflow-visible"
                  style={{ height: 18, marginTop: -9 }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <motion.path
                    d={wavePath}
                    fill="transparent"
                    stroke={t.surface}
                    strokeWidth={2.5}
                    style={{
                      filter: `drop-shadow(0 0 12px ${t.glowIntense}) drop-shadow(0 0 24px ${t.glow})`,
                    }}
                    animate={
                      isDanger
                        ? { d: wavePath.replace('Q25,', 'Q25,').replace('T100,', 'T100,') }
                        : {}
                    }
                  />
                </svg>
              )}

              {/* Surface glow line */}
              <motion.div
                className="absolute inset-x-0 top-0 w-full"
                style={{
                  height: 3,
                  background: t.surface,
                  boxShadow: `0 0 12px ${t.glowIntense}, 0 -2px 8px ${t.glow}, 0 2px 6px ${t.neon}`,
                  opacity: hasFill ? 1 : 0,
                }}
              />

              {/* Inner gloss — vertical sweep */}
              <div
                className="absolute inset-y-0 left-[15%] opacity-25"
                style={{
                  width: '20%',
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
                }}
              />
            </motion.div>

            {/* ═══════════════════════════════════════════════
                FLOATING PARTICLES — near the fill surface
                ════════════════════════════════════════════ */}
            {hasFill &&
              PARTICLES.map((pt) => {
                const particleY = p * 100 + pt.offset * 0.15 - 5;
                const isVisible = particleY < 98 && particleY > 2;
                if (!isVisible) return null;
                return (
                  <motion.div
                    key={pt.id}
                    className="absolute left-1/2 rounded-full -translate-x-1/2"
                    style={{
                      width: pt.size,
                      height: pt.size,
                      background: t.particle,
                      boxShadow: `0 0 ${pt.size + 3}px ${t.glowIntense}`,
                      bottom: `${particleY}%`,
                    }}
                    animate={{
                      opacity: [0, 0.9, 0.4, 0.9, 0],
                      y: [0, -6, -3, -8, 0],
                      scale: [1, 1.4, 0.9, 1.2, 1],
                    }}
                    transition={{
                      duration: 1.6,
                      repeat: Infinity,
                      delay: pt.delay,
                      ease: 'easeInOut',
                    }}
                  />
                );
              })}

            {/* ═══════════════════════════════════════════════
                DANGER / WARNING PULSE OVERLAY
                ════════════════════════════════════════════ */}
            {shouldPulse && (
              <motion.div
                className="absolute inset-0"
                style={{
                  borderRadius: railW,
                  boxShadow: `inset 0 0 30px ${t.glowIntense}`,
                }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{
                  duration: isDanger ? 0.35 : 0.7,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}

            {/* Outer glow ring — intensifies in danger */}
            {shouldPulse && (
              <motion.div
                className="absolute -inset-[3px] pointer-events-none"
                style={{
                  borderRadius: railW + 4,
                  border: `2px solid transparent`,
                }}
                animate={{
                  boxShadow: [
                    `0 0 8px ${t.glow}`,
                    `0 0 20px ${t.glowIntense}`,
                    `0 0 8px ${t.glow}`,
                  ],
                }}
                transition={{
                  duration: isDanger ? 0.4 : 0.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}

            {/* Glass reflection — diagonal shimmer sweep */}
            <motion.div
              className="absolute inset-x-0 h-[30%] pointer-events-none"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)`,
                borderRadius: '30%',
              }}
              animate={hasFill ? {
                top: ['-30%', '105%'],
                opacity: [0, 0.6, 0],
              } : { top: '-30%', opacity: 0 }}
              transition={hasFill ? {
                duration: 2.2,
                repeat: Infinity,
                ease: 'linear',
                delay: 0.8,
              } : {}}
            />
          </div>
        </div>
      ))}
    </>
  );
});

export default SideTimerRails;
