import type { Variants, Transition } from 'framer-motion';

// ============================================
// Beneficial Knowledge Transition Presets
// Energetic, snappy animations
// ============================================

// Snappy easing - quick and responsive
export const easeSnappy: Transition = {
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94],
};

export const easeEnergetic: Transition = {
  duration: 0.3,
  ease: [0.34, 1.56, 0.64, 1], // Overshoot for bounce effect
};

export const easeFast: Transition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
};

export const easeNormal: Transition = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1],
};

export const easeSlow: Transition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1],
};

// Bouncy spring - energetic feedback
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
};

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
};

export const springSubtle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 30,
};

// Legacy support
export const easeGraceful = easeNormal;
export const easeGracefulSlow = easeSlow;
export const easeGracefulFast = easeFast;
export const springGraceful = springSubtle;
export const bounceOut = springBouncy;

// ============================================
// Screen Transition Variants
// ============================================

export const screenVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: easeNormal,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: easeFast,
  },
};

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: easeNormal },
  exit: { opacity: 0, transition: easeFast },
};

export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: easeNormal },
  exit: { opacity: 0, y: -8, transition: easeFast },
};

export const slideDownVariants: Variants = {
  initial: { opacity: 0, y: -16 },
  animate: { opacity: 1, y: 0, transition: easeNormal },
  exit: { opacity: 0, y: 8, transition: easeFast },
};

// ============================================
// Container & Stagger Variants
// ============================================

export const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const fastContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: easeNormal,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: easeFast,
  },
};

export const scaleItemVariants: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: easeEnergetic,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: easeFast,
  },
};

// ============================================
// Card Variants - Beneficial Knowledge
// ============================================

export const cardVariants: Variants = {
  initial: {
    scale: 0.95,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: easeEnergetic,
  },
  hover: {
    scale: 1.02,
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
};

export const categoryCardVariants: Variants = {
  initial: {
    scale: 0.9,
    opacity: 0,
    y: 12,
  },
  animate: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: easeEnergetic,
  },
  hover: {
    scale: 1.02,
    y: -2,
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
  selected: {
    scale: 1.02,
    opacity: 1,
    y: 0,
    boxShadow: '0 0 25px rgba(0, 212, 170, 0.4)',
    transition: easeNormal,
  },
};

// ============================================
// Button Variants - Beneficial Knowledge
// ============================================

export const buttonVariants: Variants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.02,
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
  disabled: {
    opacity: 0.5,
    scale: 1,
  },
};

export const primaryButtonVariants: Variants = {
  initial: {
    scale: 1,
    boxShadow: '0 4px 20px rgba(0, 212, 170, 0.25)',
  },
  hover: {
    scale: 1.02,
    boxShadow: '0 6px 28px rgba(0, 212, 170, 0.4)',
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    boxShadow: '0 2px 12px rgba(0, 212, 170, 0.2)',
    transition: { duration: 0.1 },
  },
};

export const pulsingButtonVariants: Variants = {
  initial: {
    scale: 1,
    boxShadow: '0 0 20px rgba(0, 212, 170, 0.3)',
  },
  animate: {
    scale: [1, 1.02, 1],
    boxShadow: [
      '0 0 20px rgba(0, 212, 170, 0.3)',
      '0 0 35px rgba(0, 212, 170, 0.5)',
      '0 0 20px rgba(0, 212, 170, 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  tap: {
    scale: 0.97,
  },
};

// ============================================
// Answer Button Variants - Beneficial Knowledge
// ============================================

export const answerButtonVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: easeEnergetic,
  },
  default: {
    opacity: 1,
    y: 0,
  },
  hover: {
    scale: 1.02,
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
  selected: {
    scale: 1.02,
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    borderColor: '#20c5ff',
    boxShadow: '0 0 20px rgba(0, 212, 170, 0.4)',
    transition: easeNormal,
  },
  selectedYou: {
    scale: 1.02,
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    borderColor: '#20c5ff',
    boxShadow: '0 0 20px rgba(0, 212, 170, 0.5)',
    transition: easeNormal,
  },
  selectedOpponent: {
    borderColor: '#ff6b35',
    boxShadow: '0 0 15px rgba(255, 107, 53, 0.4)',
    transition: easeNormal,
  },
  correct: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22C55E',
    boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)',
    scale: [1, 1.03, 1],
    transition: { duration: 0.3 },
  },
  incorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444',
    boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
    x: [0, -6, 6, -6, 6, 0],
    transition: { duration: 0.4 },
  },
  disabled: {
    opacity: 0.5,
  },
};

// Beneficial Knowledge specific answer variants
export const answerBeneficialKnowledgeVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: easeEnergetic },
  tap: { scale: 0.95, transition: { duration: 0.1 } },
  selectedYou: {
    borderColor: '#20c5ff',
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    boxShadow: '0 0 20px rgba(0, 212, 170, 0.5)',
  },
  selectedOpponent: {
    borderColor: '#ff6b35',
    boxShadow: '0 0 15px rgba(255, 107, 53, 0.4)',
  },
  correct: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderColor: '#22C55E',
    scale: [1, 1.03, 1],
  },
  incorrect: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: '#EF4444',
    x: [0, -6, 6, -6, 6, 0],
    transition: { duration: 0.4 },
  },
};

// ============================================
// Score & Number Animations
// ============================================

export const scoreVariants: Variants = {
  initial: { scale: 1 },
  update: {
    scale: [1, 1.3, 1],
    transition: { duration: 0.4 },
  },
};

export const scoreChangeVariants: Variants = {
  initial: {
    opacity: 0,
    y: 0,
    scale: 0.8,
  },
  animate: {
    opacity: [0, 1, 1, 0],
    y: [0, -10, -20, -35],
    scale: [0.8, 1.2, 1, 0.9],
    transition: { duration: 1.2, ease: 'easeOut' },
  },
};

export const countdownVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0,
  },
  animate: {
    scale: [0, 1.4, 1],
    opacity: [0, 1, 1],
    transition: { duration: 0.5, ease: 'easeOut' },
  },
  exit: {
    scale: [1, 1.3, 0],
    opacity: [1, 0.5, 0],
    transition: { duration: 0.3 },
  },
};

// Dramatic countdown pulse - Beneficial Knowledge style with impact effect
export const countdownPulseVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0,
    rotate: -10,
  },
  animate: {
    scale: [0, 1.5, 1.1, 1],
    opacity: [0, 1, 1, 1],
    rotate: [-10, 5, -2, 0],
    transition: {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1], // Bouncy easing
      times: [0, 0.4, 0.7, 1],
    },
  },
  exit: {
    scale: [1, 1.3, 0],
    opacity: [1, 0.6, 0],
    y: -30,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

// ============================================
// Avatar & VS Animations - Beneficial Knowledge
// ============================================

export const avatarSlideLeftVariants: Variants = {
  initial: {
    x: -60,
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: springBouncy,
  },
};

export const avatarSlideRightVariants: Variants = {
  initial: {
    x: 60,
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: springBouncy,
  },
};

// Beneficial Knowledge swoosh variants
export const avatarSwooshLeftVariants: Variants = {
  initial: { x: '-100vw', rotate: -15, opacity: 0 },
  animate: {
    x: 0,
    rotate: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 200, damping: 20, delay: 0.2 },
  },
};

export const avatarSwooshRightVariants: Variants = {
  initial: { x: '100vw', rotate: 15, opacity: 0 },
  animate: {
    x: 0,
    rotate: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 200, damping: 20, delay: 0.2 },
  },
};

export const vsVariants: Variants = {
  initial: {
    scale: 0,
    rotate: -180,
    opacity: 0,
  },
  animate: {
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
      delay: 0.4,
    },
  },
};

// ============================================
// Searching Animations - Pulse Ring
// ============================================

export const pulseRingVariants: Variants = {
  initial: {
    scale: 0.8,
    opacity: 0.8,
  },
  animate: {
    scale: 2,
    opacity: 0,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeOut',
    },
  },
};

export const searchingIconVariants: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.1, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// Results & Victory Animations - Beneficial Knowledge
// ============================================

export const victoryVariants: Variants = {
  initial: {
    scale: 0,
    rotate: -10,
    opacity: 0,
  },
  animate: {
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: easeEnergetic,
  },
};

// Dramatic victory text
export const victoryTextVariants: Variants = {
  initial: { scale: 0, rotate: -15, opacity: 0 },
  animate: {
    scale: [0, 1.3, 1],
    rotate: [-15, 5, 0],
    opacity: 1,
    transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
  },
};

// Winner avatar enlargement with glow
export const winnerAvatarVariants: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.4, 1.25],
    transition: { duration: 0.6 },
  },
  glow: {
    boxShadow: [
      '0 0 30px rgba(0, 212, 170, 0.4)',
      '0 0 60px rgba(0, 212, 170, 0.7)',
      '0 0 30px rgba(0, 212, 170, 0.4)',
    ],
    transition: { duration: 2, repeat: Infinity },
  },
};

export const defeatVariants: Variants = {
  initial: {
    scale: 0.95,
    opacity: 0,
    y: 12,
  },
  animate: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: easeNormal,
  },
};

export const confettiVariants: Variants = {
  initial: {
    y: -50,
    opacity: 1,
  },
  animate: (custom: number) => ({
    y: '100vh',
    rotate: 720,
    opacity: 0,
    transition: {
      duration: 2.5 + custom * 0.3,
      ease: 'easeIn',
    },
  }),
};

// ============================================
// Modal & Overlay Variants
// ============================================

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: easeFast },
  exit: { opacity: 0, transition: easeFast },
};

export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 16,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: easeEnergetic,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 16,
    transition: easeFast,
  },
};

export const bottomSheetVariants: Variants = {
  initial: {
    y: '100%',
  },
  animate: {
    y: 0,
    transition: springBouncy,
  },
  exit: {
    y: '100%',
    transition: easeNormal,
  },
};

// ============================================
// Tab Bar Variants - Beneficial Knowledge
// ============================================

export const tabItemVariants: Variants = {
  initial: { scale: 1, color: 'rgba(148, 163, 184, 0.9)' },
  tap: { scale: 0.96 },
  active: {
    scale: 1.05,
    color: '#20c5ff',
    transition: springBouncy,
  },
  inactive: {
    scale: 1,
    color: 'rgba(148, 163, 184, 0.7)',
    transition: easeNormal,
  },
};

export const tabIndicatorVariants: Variants = {
  initial: { scaleX: 0 },
  animate: {
    scaleX: 1,
    transition: easeNormal,
  },
};

// ============================================
// Progress Bar Variants
// ============================================

export const progressBarVariants: Variants = {
  initial: { scaleX: 0, originX: 0 },
  animate: (progress: number) => ({
    scaleX: progress / 100,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

// ============================================
// Badge Variants
// ============================================

export const badgeVariants: Variants = {
  initial: { scale: 0.9, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: easeEnergetic,
  },
  hover: {
    scale: 1.05,
    transition: easeFast,
  },
};

// ============================================
// List Item Variants
// ============================================

export const listItemVariants: Variants = {
  initial: {
    opacity: 0,
    x: -12,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: easeNormal,
  },
  exit: {
    opacity: 0,
    x: 12,
    transition: easeFast,
  },
  hover: {
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
    transition: easeFast,
  },
};

// ============================================
// Podium Variants (Leaderboard)
// ============================================

export const podiumVariants: Variants = {
  initial: {
    y: 60,
    opacity: 0,
  },
  animate: (custom: number) => ({
    y: 0,
    opacity: 1,
    transition: {
      ...springBouncy,
      delay: custom * 0.15,
    },
  }),
};

export const podiumAvatarVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      ...springBouncy,
      delay: 0.4,
    },
  },
};

export const medalVariants: Variants = {
  initial: {
    scale: 0,
    rotate: -180,
    opacity: 0,
  },
  animate: {
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: {
      ...springBouncy,
      delay: 0.6,
    },
  },
};

// ============================================
// Timer Variants - Beneficial Knowledge
// ============================================

export const timerVariants: Variants = {
  normal: {
    scale: 1,
    transition: easeFast,
  },
  warning: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  critical: {
    scale: [1, 1.1, 1],
    transition: {
      duration: 0.3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// Shimmer / Loading Variants
// ============================================

export const shimmerVariants: Variants = {
  initial: {
    backgroundPosition: '-200% 0',
  },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// ============================================
// Notification / Toast Variants
// ============================================

export const toastVariants: Variants = {
  initial: {
    opacity: 0,
    y: -16,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springBouncy,
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.95,
    transition: easeFast,
  },
};

// ============================================
// Beneficial Knowledge Specific Variants
// ============================================

// Teal glow pulse for victory/success states
export const tealGlowVariants: Variants = {
  initial: {
    boxShadow: '0 0 20px rgba(0, 212, 170, 0.3)',
  },
  animate: {
    boxShadow: [
      '0 0 20px rgba(0, 212, 170, 0.3)',
      '0 0 40px rgba(0, 212, 170, 0.5)',
      '0 0 20px rgba(0, 212, 170, 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Orange glow for opponent
export const orangeGlowVariants: Variants = {
  initial: {
    boxShadow: '0 0 20px rgba(255, 107, 53, 0.3)',
  },
  animate: {
    boxShadow: [
      '0 0 20px rgba(255, 107, 53, 0.3)',
      '0 0 40px rgba(255, 107, 53, 0.5)',
      '0 0 20px rgba(255, 107, 53, 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Lightning flash effect
export const lightningVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: [0, 1, 0],
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

// Bounce in animation
export const bounceInVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: [0, 1.2, 0.9, 1],
    opacity: 1,
    transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
  },
};

// Float animation
export const floatVariants: Variants = {
  initial: { y: 0 },
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// Rank Up & Streak Animations
// ============================================

// Rank up celebration - dramatic entrance
export const rankUpVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0,
    rotate: -180,
  },
  animate: {
    scale: [0, 1.5, 1],
    opacity: 1,
    rotate: 0,
    transition: {
      duration: 0.8,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },
};

// Rank badge glow pulse
export const rankGlowVariants: Variants = {
  initial: { boxShadow: '0 0 0 rgba(255, 215, 0, 0)' },
  animate: {
    boxShadow: [
      '0 0 20px rgba(255, 215, 0, 0.3)',
      '0 0 60px rgba(255, 215, 0, 0.8)',
      '0 0 20px rgba(255, 215, 0, 0.3)',
    ],
    transition: {
      duration: 1.5,
      repeat: 3,
      ease: 'easeInOut',
    },
  },
};

// Rank up text animation
export const rankUpTextVariants: Variants = {
  initial: { opacity: 0, y: 30, scale: 0.5 },
  animate: {
    opacity: 1,
    y: 0,
    scale: [0.5, 1.2, 1],
    transition: {
      duration: 0.6,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },
};

// Streak counter animation
export const streakCounterVariants: Variants = {
  initial: { scale: 1 },
  increment: {
    scale: [1, 1.5, 1],
    transition: {
      duration: 0.3,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },
};

// Victory burst particles
export const victoryBurstVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: [0, 1.5, 1],
    opacity: [0, 1, 0.8],
    transition: {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },
};

// Points popup animation
export const pointsPopupVariants: Variants = {
  initial: { opacity: 0, y: 0, scale: 0.8 },
  animate: {
    opacity: [0, 1, 1, 0],
    y: [0, -40, -60, -80],
    scale: [0.8, 1.2, 1, 0.8],
    transition: {
      duration: 1.5,
      ease: 'easeOut',
    },
  },
};

// Level up shine effect
export const shineVariants: Variants = {
  initial: { x: '-100%', opacity: 0 },
  animate: {
    x: '200%',
    opacity: [0, 1, 0],
    transition: {
      duration: 0.8,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// Searching Screen Variants
// ============================================

// User card entrance - slides from left
export const userCardEntranceVariants: Variants = {
  initial: { x: -100, opacity: 0, scale: 0.8 },
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 200, damping: 20, delay: 0.2 },
  },
};

// Mystery card entrance - slides from right
export const mysteryCardEntranceVariants: Variants = {
  initial: { x: 100, opacity: 0, scale: 0.8 },
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 200, damping: 20, delay: 0.3 },
  },
};

// Mystery card glow pulse
export const mysteryGlowVariants: Variants = {
  animate: {
    boxShadow: [
      '0 0 20px rgba(147, 51, 234, 0.3)',
      '0 0 40px rgba(147, 51, 234, 0.6)',
      '0 0 20px rgba(147, 51, 234, 0.3)',
    ],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

// Status message fade transition
export const statusMessageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// Floating particle animation
export const floatingParticleVariants: Variants = {
  initial: { opacity: 0.3 },
  animate: (custom: { yOffset: number; duration: number; delay: number }) => ({
    y: [0, custom.yOffset, 0],
    opacity: [0.3, 0.7, 0.3],
    transition: {
      duration: custom.duration,
      repeat: Infinity,
      delay: custom.delay,
      ease: 'easeInOut',
    },
  }),
};

// ============================================
// Homepage Redesign Variants
// ============================================

// Card entrance with fade + slide up
export const cardEntranceVariants: Variants = {
  initial: {
    opacity: 0,
    y: 24,
    scale: 0.96,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.98,
    transition: easeFast,
  },
};

// Button press scale down
export const buttonPressVariants: Variants = {
  initial: { scale: 1 },
  tap: {
    scale: 0.95,
    transition: { duration: 0.1, ease: 'easeOut' },
  },
  hover: {
    scale: 1.02,
    transition: easeFast,
  },
};

// Progress bar shimmer
export const progressShimmerVariants: Variants = {
  initial: {
    backgroundPosition: '-200% 0',
  },
  animate: {
    backgroundPosition: '200% 0',
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Pulsing dot for online indicator
export const pulsingDotVariants: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.3, 1],
    opacity: [1, 0.7, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Topic card variants - enhanced for new design
export const topicCardVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: easeEnergetic,
  },
  hover: {
    y: -4,
    scale: 1.02,
    transition: easeFast,
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
  selected: {
    scale: 1,
    opacity: 1,
    y: 0,
    boxShadow: '0 0 30px rgba(0, 217, 255, 0.45)',
    transition: easeNormal,
  },
};

// Quick action card horizontal slide
export const quickActionVariants: Variants = {
  initial: {
    opacity: 0,
    x: -20,
  },
  animate: (custom: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      ...easeNormal,
      delay: custom * 0.05,
    },
  }),
  hover: {
    y: -2,
    transition: easeFast,
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

// Floating play button animation
export const floatingPlayButtonVariants: Variants = {
  initial: {
    y: 48,
    opacity: 0,
    scale: 0.92,
  },
  animate: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 28,
      delay: 0.04,
    },
  },
  float: {
    y: [0, -4, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  tap: {
    scale: 0.92,
    transition: { duration: 0.15 },
  },
  disabled: {
    opacity: 0.5,
    scale: 0.95,
    filter: 'grayscale(50%)',
  },
};

// Stat card entrance with count-up feel
export const statCardVariants: Variants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.9,
  },
  animate: (custom: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      ...easeEnergetic,
      delay: custom * 0.08,
    },
  }),
  hover: {
    scale: 1.05,
    transition: easeFast,
  },
};

// Profile section entrance
export const profileSectionVariants: Variants = {
  initial: {
    opacity: 0,
    y: -20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

// Avatar rank glow animation
export const avatarRankGlowVariants: Variants = {
  initial: { opacity: 0.5 },
  animate: {
    opacity: [0.5, 1, 0.5],
    scale: [1, 1.05, 1],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Staggered grid for 2-column category layout
export const categoryGridVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
};

// Category card item for grid
export const categoryGridItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 24,
    scale: 0.92,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: easeEnergetic,
  },
};
