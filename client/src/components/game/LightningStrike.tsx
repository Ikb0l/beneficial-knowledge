import { memo, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LightningStrikeProps {
  show: boolean;
  onComplete?: () => void;
}

function frac(value: number): number {
  return value - Math.floor(value);
}

function seeded01(seed: number): number {
  return frac(Math.sin(seed) * 10000);
}

function seededRange(seed: number, min: number, max: number): number {
  return min + seeded01(seed) * (max - min);
}

/**
 * Lightning strike effect that animates from top to score area
 * Includes impact flash and spark scatter effects
 */
export const LightningStrike = memo(function LightningStrike({
  show,
  onComplete,
}: LightningStrikeProps) {
  const [phase, setPhase] = useState<'idle' | 'strike' | 'impact' | 'sparks'>('idle');

  useEffect(() => {
    if (show) {
      const strikeTimer = setTimeout(() => setPhase('strike'), 0);
      const impactTimer = setTimeout(() => setPhase('impact'), 150);
      const sparksTimer = setTimeout(() => setPhase('sparks'), 250);
      const completeTimer = setTimeout(() => {
        setPhase('idle');
        onComplete?.();
      }, 800);

      return () => {
        clearTimeout(strikeTimer);
        clearTimeout(impactTimer);
        clearTimeout(sparksTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [show, onComplete]);

  const sparks = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: (seeded01(10 + i * 1.3) - 0.5) * 80,
      y: -20 - seeded01(20 + i * 2.1) * 60,
      delay: seeded01(30 + i * 3.7) * 0.1,
      size: 3 + seeded01(40 + i * 4.9) * 4,
    })),
    []
  );

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-50"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Screen flash */}
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.15, 0] }}
            transition={{ duration: 0.3 }}
          />

          {/* Lightning bolt SVG */}
          {(phase === 'strike' || phase === 'impact') && (
            <motion.svg
              viewBox="0 0 100 200"
              className="absolute left-1/2 top-0 w-24 h-auto"
              style={{
                transform: 'translateX(-50%)',
                filter: 'drop-shadow(0 0 20px #15a7e0) drop-shadow(0 0 40px #15a7e0)',
              }}
              initial={{ opacity: 0, y: -50, scaleY: 0.3 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              {/* Main lightning bolt path */}
              <motion.path
                d="M50 0 L55 40 L70 45 L45 100 L55 105 L30 200 L40 110 L25 105 L50 50 L35 45 Z"
                fill="url(#lightningGradient)"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.15 }}
              />
              {/* White core for intensity */}
              <motion.path
                d="M48 5 L52 38 L60 42 L44 95 L52 100 L35 190 L42 105 L32 102 L48 52 L40 48 Z"
                fill="white"
                opacity={0.8}
              />
              <defs>
                <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#15a7e0" />
                  <stop offset="50%" stopColor="#20c5ff" />
                  <stop offset="100%" stopColor="#15a7e0" />
                </linearGradient>
              </defs>
            </motion.svg>
          )}

          {/* Impact flash at bottom */}
          {(phase === 'impact' || phase === 'sparks') && (
            <motion.div
              className="absolute left-1/2 bottom-1/3 -translate-x-1/2"
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: [0, 2.5, 3], opacity: [1, 0.8, 0] }}
              transition={{ duration: 0.4 }}
            >
              <div
                className="w-20 h-20 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(0, 245, 212, 0.8) 0%, rgba(0, 212, 170, 0.4) 40%, transparent 70%)',
                  filter: 'blur(4px)',
                }}
              />
            </motion.div>
          )}

          {/* Sparks scatter */}
          {phase === 'sparks' && (
            <div className="absolute left-1/2 bottom-1/3 -translate-x-1/2">
              {sparks.map((spark) => (
                <motion.div
                  key={spark.id}
                  className="absolute rounded-full"
                  style={{
                    width: spark.size,
                    height: spark.size,
                    background: 'linear-gradient(135deg, #15a7e0, #ffffff)',
                    boxShadow: '0 0 6px #15a7e0',
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: spark.x,
                    y: spark.y,
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{
                    duration: 0.5,
                    delay: spark.delay,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          )}

          {/* Electric arcs around impact point */}
          {phase === 'impact' && (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute left-1/2 bottom-1/3"
                  style={{
                    width: 2,
                    height: seededRange(50 + i * 7.7, 20, 40),
                    background: 'linear-gradient(180deg, #15a7e0, transparent)',
                    transform: `translateX(-50%) rotate(${i * 90 + 45}deg)`,
                    transformOrigin: 'center bottom',
                  }}
                  initial={{ opacity: 1, scaleY: 0 }}
                  animate={{ opacity: [1, 0], scaleY: [0, 1] }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                />
              ))}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Score rolling number animation with electric glow
 */
interface ScoreRollProps {
  value: number;
  previousValue: number;
  show: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ScoreRoll = memo(function ScoreRoll({
  value,
  previousValue,
  show,
  className = '',
  style,
}: ScoreRollProps) {
  const [displayValue, setDisplayValue] = useState(previousValue);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!show) {
      setIsAnimating(false);
      setDisplayValue(previousValue);
      return;
    }
    if (value === previousValue) {
      setIsAnimating(false);
      setDisplayValue(value);
      return;
    }

    setIsAnimating(true);
    const diff = value - previousValue;
    const steps = 20;
    const increment = diff / steps;
    let current = previousValue;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current += increment;
      setDisplayValue(Math.round(current));

      if (step >= steps) {
        setDisplayValue(value);
        setIsAnimating(false);
        clearInterval(interval);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [show, value, previousValue]);

  return (
    <motion.span
      className={`font-score tabular-nums ${className} ${isAnimating ? 'electric-glow' : ''}`}
      style={style}
      animate={isAnimating ? {
        scale: [1, 1.15, 1],
      } : {}}
      transition={{ duration: 0.5 }}
    >
      {displayValue}
    </motion.span>
  );
});

export default LightningStrike;
