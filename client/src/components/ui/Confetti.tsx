import { forwardRef, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  size: number;
  rounded: boolean;
}

interface ConfettiProps {
  active?: boolean;
  duration?: number;
  particleCount?: number;
  className?: string;
}

const confettiColors = [
  '#20c5ff', // Teal
  '#ff6b35', // Orange
  '#9333EA', // Purple
  '#22C55E', // Green
  '#EAB308', // Yellow
  '#EC4899', // Pink
  '#3B82F6', // Blue
];

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    delay: Math.random() * 0.5,
    rotation: Math.random() * 360,
    size: Math.random() * 8 + 4,
    rounded: Math.random() > 0.5,
  }));
}

export const Confetti = forwardRef<HTMLDivElement, ConfettiProps>(
  ({ active = true, duration = 3000, particleCount = 50, className }, ref) => {
    const [isVisible, setIsVisible] = useState(active);
    const pieces = useMemo(
      () => (active ? generateConfetti(particleCount) : []),
      [active, particleCount]
    );

    useEffect(() => {
      const showTimer = setTimeout(() => {
        setIsVisible(active);
      }, 0);

      if (!active) {
        return () => clearTimeout(showTimer);
      }

      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, duration);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }, [active, duration, particleCount]);

    return (
      <div
        ref={ref}
        className={cn(
          'fixed inset-0 pointer-events-none overflow-hidden z-50',
          className
        )}
      >
        <AnimatePresence>
          {isVisible &&
            pieces.map((piece) => (
              <motion.div
                key={piece.id}
                initial={{
                  x: `${piece.x}vw`,
                  y: -20,
                  rotate: 0,
                  opacity: 1,
                }}
                animate={{
                  y: '110vh',
                  rotate: piece.rotation + 720,
                  opacity: [1, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 3,
                  delay: piece.delay,
                  ease: 'easeIn',
                }}
                style={{
                  position: 'absolute',
                  width: piece.size,
                  height: piece.size,
                  backgroundColor: piece.color,
                  borderRadius: piece.rounded ? '50%' : '2px',
                }}
              />
            ))}
        </AnimatePresence>
      </div>
    );
  }
);

Confetti.displayName = 'Confetti';

// Victory Burst - Radial particle burst effect
interface VictoryBurstProps {
  active?: boolean;
  className?: string;
}

export const VictoryBurst = forwardRef<HTMLDivElement, VictoryBurstProps>(
  ({ active = true, className }, ref) => {
    const [isVisible, setIsVisible] = useState(active);

    useEffect(() => {
      const showTimer = setTimeout(() => {
        setIsVisible(active);
      }, 0);

      if (!active) {
        return () => clearTimeout(showTimer);
      }

      const hideTimer = setTimeout(() => setIsVisible(false), 1000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }, [active]);

    const particles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      angle: (i * 360) / 12,
      color: confettiColors[i % confettiColors.length],
    }));

    return (
      <div
        ref={ref}
        className={cn(
          'absolute inset-0 pointer-events-none flex items-center justify-center',
          className
        )}
      >
        <AnimatePresence>
          {isVisible &&
            particles.map((particle) => (
              <motion.div
                key={particle.id}
                initial={{
                  scale: 0,
                  x: 0,
                  y: 0,
                  opacity: 1,
                }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((particle.angle * Math.PI) / 180) * 100,
                  y: Math.sin((particle.angle * Math.PI) / 180) * 100,
                  opacity: [1, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.8,
                  ease: 'easeOut',
                }}
                className="absolute w-3 h-3 rounded-full"
                style={{ backgroundColor: particle.color }}
              />
            ))}
        </AnimatePresence>
      </div>
    );
  }
);

VictoryBurst.displayName = 'VictoryBurst';

export default Confetti;
