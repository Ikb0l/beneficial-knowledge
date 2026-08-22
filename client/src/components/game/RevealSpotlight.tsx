import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RevealSpotlightProps {
  isCorrect: boolean;
  show: boolean;
}

/**
 * Dramatic spotlight beam effect for the correct answer reveal
 * Shows a golden conical light beam from above
 */
export const RevealSpotlight = memo(function RevealSpotlight({
  isCorrect,
  show,
}: RevealSpotlightProps) {
  if (!isCorrect || !show) return null;

  const seeded01 = (seed: number) => {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Main spotlight beam */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: '-150%',
            width: '200%',
            height: '300%',
            background: `
              linear-gradient(
                180deg,
                rgba(34, 197, 94, 0) 0%,
                rgba(34, 197, 94, 0.05) 20%,
                rgba(34, 197, 94, 0.15) 40%,
                rgba(34, 197, 94, 0.25) 50%,
                rgba(34, 197, 94, 0.15) 60%,
                rgba(34, 197, 94, 0.05) 80%,
                rgba(34, 197, 94, 0) 100%
              )
            `,
            clipPath: 'polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)',
          }}
          initial={{
            opacity: 0,
            scaleY: 0,
            transformOrigin: 'top center'
          }}
          animate={{
            opacity: 1,
            scaleY: 1,
          }}
          transition={{
            duration: 0.5,
            ease: [0.34, 1.56, 0.64, 1]
          }}
        />

        {/* Green edge highlights on the beam */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: '-150%',
            width: '200%',
            height: '300%',
            background: `
              linear-gradient(
                180deg,
                rgba(34, 197, 94, 0) 0%,
                rgba(34, 197, 94, 0.4) 50%,
                rgba(34, 197, 94, 0) 100%
              )
            `,
            clipPath: 'polygon(45% 0%, 46% 0%, 48% 100%, 0% 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.4] }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        {/* Right edge of beam */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: '-150%',
            width: '200%',
            height: '300%',
            background: `
              linear-gradient(
                180deg,
                rgba(34, 197, 94, 0) 0%,
                rgba(34, 197, 94, 0.4) 50%,
                rgba(34, 197, 94, 0) 100%
              )
            `,
            clipPath: 'polygon(54% 0%, 55% 0%, 100% 100%, 52% 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.4] }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        {/* Pulsing glow ring around the button */}
        <motion.div
          className="absolute inset-0 rounded-2xl"
          style={{
            boxShadow: `
              inset 0 0 30px rgba(34, 197, 94, 0.3),
              0 0 40px rgba(34, 197, 94, 0.4),
              0 0 60px rgba(34, 197, 94, 0.3)
            `,
          }}
          animate={{
            boxShadow: [
              `inset 0 0 30px rgba(34, 197, 94, 0.3), 0 0 40px rgba(34, 197, 94, 0.4), 0 0 60px rgba(34, 197, 94, 0.3)`,
              `inset 0 0 40px rgba(34, 197, 94, 0.5), 0 0 60px rgba(34, 197, 94, 0.6), 0 0 80px rgba(34, 197, 94, 0.4)`,
              `inset 0 0 30px rgba(34, 197, 94, 0.3), 0 0 40px rgba(34, 197, 94, 0.4), 0 0 60px rgba(34, 197, 94, 0.3)`,
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Floating green particles in the spotlight */}
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${30 + seeded01(100 + i * 1.3) * 40}%`,
              bottom: '0%',
              background: 'linear-gradient(135deg, #22c55e, #86efac)',
              boxShadow: '0 0 4px rgba(34, 197, 94, 0.8)',
            }}
            initial={{
              opacity: 0,
              y: 0,
              scale: 0
            }}
            animate={{
              opacity: [0, 1, 0],
              y: -150 - seeded01(200 + i * 2.1) * 100,
              scale: [0, 1, 0.5],
              x: (seeded01(300 + i * 3.7) - 0.5) * 40,
            }}
            transition={{
              duration: 2 + seeded01(400 + i * 4.9),
              delay: 0.5 + i * 0.15,
              repeat: Infinity,
              repeatDelay: seeded01(500 + i * 6.2) * 2,
              ease: 'easeOut',
            }}
          />
        ))}
      </motion.div>
    </AnimatePresence>
  );
});

export default RevealSpotlight;
