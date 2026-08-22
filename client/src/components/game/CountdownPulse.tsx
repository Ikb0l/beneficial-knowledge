import { memo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownPulseProps {
  show: boolean;
  nextRoundNumber?: number;
  onComplete?: () => void;
  playSound?: (sound: 'questionReveal') => void;
  startDelayMs?: number;
  completeDelayMs?: number;
}

/**
 * Countdown Pulse component for next round transition
 * Shows "Round X" briefly with expanding cyan/electric rings
 */
export const CountdownPulse = memo(function CountdownPulse({
  show,
  nextRoundNumber,
  onComplete,
  playSound,
  startDelayMs = 300,
  completeDelayMs = 1200,
}: CountdownPulseProps) {
  const [count, setCount] = useState<'round' | null>(null);
  const [rings, setRings] = useState<number[]>([]);

  // Add a new ring for each count
  const addRing = useCallback(() => {
    setRings((prev) => [...prev, Date.now()]);
  }, []);

  useEffect(() => {
    if (!show) {
      setCount(null);
      setRings([]);
      return;
    }

    // Show round announcement
    const sequence = ['round'] as const;
    let index = 0;

    const runSequence = () => {
      if (index < sequence.length) {
        const current = sequence[index];
        setCount(current);
        addRing();

        // Play reveal sound for round
        if (playSound) {
          playSound('questionReveal');
        }

        index++;
        if (index < sequence.length) {
          setTimeout(runSequence, 800);
        } else {
          // Complete after showing "Round X"
          setTimeout(() => {
            onComplete?.();
          }, Math.max(0, completeDelayMs));
        }
      }
    };

    // Small delay before starting
    const startTimer = setTimeout(runSequence, Math.max(0, startDelayMs));

    return () => {
      clearTimeout(startTimer);
    };
  }, [show, addRing, onComplete, playSound, startDelayMs, completeDelayMs]);

  // Clean up old rings
  useEffect(() => {
    if (rings.length > 0) {
      const cleanup = setTimeout(() => {
        setRings((prev) => prev.slice(1));
      }, 800);
      return () => clearTimeout(cleanup);
    }
  }, [rings]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Dark overlay */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Round announcement container */}
        <div className="relative flex items-center justify-center">
          {/* Expanding rings - Electric cyan */}
          {rings.map((ringId) => (
            <motion.div
              key={ringId}
              className="absolute rounded-full border-4"
              style={{
                borderColor: '#20c5ff',
                width: 120,
                height: 120,
              }}
              initial={{
                scale: 1,
                opacity: 0.8,
                borderWidth: 4,
              }}
              animate={{
                scale: 2.5,
                opacity: 0,
                borderWidth: 1,
              }}
              transition={{
                duration: 0.8,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Round text */}
          <AnimatePresence mode="wait">
            {count !== null && (
              <motion.div
                key={count}
                className="relative z-10 text-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.3, 1], opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{
                  duration: 0.5,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
              >
                <motion.div className="flex flex-col items-center gap-2">
                  <motion.p
                    className="text-white/70 text-xl font-medium"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    Get Ready
                  </motion.p>
                  <motion.p
                    className="font-heading font-black text-5xl"
                    style={{
                      color: '#22c55e',
                      textShadow: `
                        0 0 40px rgba(34, 197, 94, 0.6),
                        0 0 80px rgba(34, 197, 94, 0.3)
                      `,
                    }}
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                  >
                    Round {nextRoundNumber ?? '?'}
                  </motion.p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export default CountdownPulse;
