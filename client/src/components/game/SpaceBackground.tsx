import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

interface Orb {
  id: number;
  left: string;
  top: string;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

interface SpaceBackgroundProps {
  starCount?: number;
  showNebula?: boolean;
  showOrbs?: boolean;
  intensity?: 'low' | 'medium' | 'high';
}

export const SpaceBackground = memo(function SpaceBackground({
  starCount = 60,
  showNebula = true,
  showOrbs = true,
  intensity = 'medium',
}: SpaceBackgroundProps) {
  // Generate stars with varied properties
  const stars = useMemo<Star[]>(() => {
    const seeded01 = (seed: number) => {
      const value = Math.sin(seed) * 10000;
      return value - Math.floor(value);
    };

    return Array.from({ length: starCount }, (_, i) => ({
      id: i,
      left: `${(i * 37 + 13) % 100}%`,
      top: `${(i * 61 + 7) % 100}%`,
      size: seeded01(100 + i * 1.7) > 0.8 ? 2 : 1,
      delay: (i * 0.1) % 3,
      duration: 2 + seeded01(200 + i * 2.3) * 2,
      opacity: 0.3 + seeded01(300 + i * 3.1) * 0.5,
    }));
  }, [starCount]);

  // Generate floating orbs
  const orbs = useMemo<Orb[]>(() => {
    if (!showOrbs) return [];
    return [
      { id: 1, left: '10%', top: '20%', size: 200, color: 'rgba(147, 51, 234, 0.15)', duration: 60, delay: 0 },
      { id: 2, left: '80%', top: '60%', size: 250, color: 'rgba(0, 212, 170, 0.12)', duration: 75, delay: 10 },
      { id: 3, left: '50%', top: '80%', size: 180, color: 'rgba(59, 130, 246, 0.1)', duration: 50, delay: 5 },
    ];
  }, [showOrbs]);

  const opacityMultiplier = intensity === 'low' ? 0.5 : intensity === 'high' ? 1.2 : 1;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Deep space gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #0d0221 0%, #150734 40%, #1a0a2e 70%, #0d0221 100%)',
        }}
      />

      {/* Nebula clouds */}
      {showNebula && (
        <>
          {/* Purple nebula - top right */}
          <motion.div
            className="absolute"
            style={{
              top: '5%',
              right: '10%',
              width: '40vw',
              height: '40vw',
              maxWidth: '400px',
              maxHeight: '400px',
              background: 'radial-gradient(ellipse at center, rgba(147, 51, 234, 0.15) 0%, rgba(147, 51, 234, 0.05) 40%, transparent 70%)',
              filter: 'blur(40px)',
              opacity: opacityMultiplier,
            }}
            animate={{
              x: [0, 30, 0, -20, 0],
              y: [0, 20, -10, 0],
              scale: [1, 1.05, 1, 0.98, 1],
            }}
            transition={{
              duration: 60,
              repeat: Infinity,
              ease: 'linear',
            }}
          />

          {/* Blue nebula - bottom left */}
          <motion.div
            className="absolute"
            style={{
              bottom: '20%',
              left: '5%',
              width: '50vw',
              height: '35vw',
              maxWidth: '500px',
              maxHeight: '350px',
              background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.04) 40%, transparent 70%)',
              filter: 'blur(50px)',
              opacity: opacityMultiplier,
            }}
            animate={{
              x: [0, -20, 10, 0],
              y: [0, -15, 20, 0],
              scale: [1, 1.03, 0.97, 1],
            }}
            transition={{
              duration: 75,
              repeat: Infinity,
              ease: 'linear',
              delay: 5,
            }}
          />

          {/* Teal nebula - center */}
          <motion.div
            className="absolute"
            style={{
              top: '40%',
              left: '30%',
              width: '35vw',
              height: '30vw',
              maxWidth: '350px',
              maxHeight: '300px',
              background: 'radial-gradient(ellipse at center, rgba(0, 212, 170, 0.08) 0%, rgba(0, 212, 170, 0.02) 50%, transparent 70%)',
              filter: 'blur(60px)',
              opacity: opacityMultiplier,
            }}
            animate={{
              x: [0, 15, -10, 0],
              y: [0, 10, -5, 0],
            }}
            transition={{
              duration: 90,
              repeat: Infinity,
              ease: 'linear',
              delay: 10,
            }}
          />
        </>
      )}

      {/* Floating orbs */}
      {orbs.map((orb) => (
        <motion.div
          key={orb.id}
          className="absolute rounded-full"
          style={{
            left: orb.left,
            top: orb.top,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle at 30% 30%, ${orb.color}, transparent 70%)`,
            filter: 'blur(30px)',
          }}
          animate={{
            x: [0, 50, -30, 20, 0],
            y: [0, -40, 30, -20, 0],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: 'linear',
            delay: orb.delay,
          }}
        />
      ))}

      {/* Twinkling stars */}
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
          }}
          animate={{
            opacity: [star.opacity * 0.3, star.opacity, star.opacity * 0.3],
            scale: [1, star.size > 1 ? 1.3 : 1.1, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: star.delay,
          }}
        />
      ))}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(11, 16, 32, 0.6) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export default SpaceBackground;
