/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Telegram theme colors (accessed via CSS variables)
        'tg-bg': 'var(--tg-theme-bg-color, #0b1020)',
        'tg-text': 'var(--tg-theme-text-color, #ffffff)',
        'tg-hint': 'var(--tg-theme-hint-color, #9fb1cc)',
        'tg-link': 'var(--tg-theme-link-color, #20c5ff)',
        'tg-button': 'var(--tg-theme-button-color, #20c5ff)',
        'tg-button-text': 'var(--tg-theme-button-text-color, #0b1020)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color, #111b33)',

        // Beneficial Knowledge Background Colors
        'bg': {
          primary: '#0b1020',
          secondary: '#111b33',
          card: '#16223f',
          'gradient-from': '#081126',
          'gradient-via': '#12274f',
          'gradient-to': '#0b1020',
        },

        // Space Background Colors
        'space': {
          dark: '#0d0221',
          mid: '#150734',
          light: '#1a0a2e',
        },

        // Timer Colors
        'timer': {
          safe: '#20c5ff',
          warning: '#f59e0b',
          danger: '#ef4444',
        },

        // Beneficial Knowledge Accent Colors
        'accent': {
          teal: '#20c5ff',
          orange: '#ff8a4d',
          purple: '#7c78ff',
          gold: '#f59e0b',
          electric: '#00f0ff',
          coral: '#ff6b6b',
          lime: '#00ff87',
        },

        // Player Colors
        'player': {
          you: '#20c5ff',
          opponent: '#ff8a4d',
        },

        // Feedback Colors
        'feedback': {
          correct: '#22C55E',
          wrong: '#EF4444',
          warning: '#EAB308',
        },

        // Legacy semantic colors (for compatibility)
        success: '#22C55E',
        error: '#EF4444',
        warning: '#EAB308',
        info: '#3B82F6',
        correct: '#22C55E',
        incorrect: '#EF4444',

        // Rank Colors (keeping for rank system)
        rank: {
          bronze: '#CD7F32',
          silver: '#C0C0C0',
          gold: '#FFD700',
          platinum: '#E5E4E2',
          diamond: '#B9F2FF',
          master: '#9932CC',
          grandmaster: '#FF4500',
        },

        // Text Colors
        text: {
          primary: '#ffffff',
          secondary: '#9fb1cc',
          muted: '#7484a1',
          tertiary: '#8fa2bf',
        },

        secondary: {
          500: '#16223f',
        },
      },

      fontFamily: {
        // Unified typography system
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'sans-serif'],
        word: ['Fraunces', '"Times New Roman"', 'serif'],
        score: ['Sora', 'Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
        '6xl': ['4rem', { lineHeight: '1' }],
        '7xl': ['5rem', { lineHeight: '1' }],
        'stat-number': ['2.5rem', { lineHeight: '1', fontWeight: '800' }],
      },

      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      borderWidth: {
        3: '3px',
      },

      boxShadow: {
        // Beneficial Knowledge Glow effects
        'glow-teal': '0 0 16px rgba(32, 197, 255, 0.28)',
        'glow-teal-lg': '0 0 28px rgba(32, 197, 255, 0.36)',
        'glow-teal-intense': '0 0 48px rgba(32, 197, 255, 0.42)',
        'glow-orange': '0 0 20px rgba(255, 107, 53, 0.3)',
        'glow-orange-lg': '0 0 40px rgba(255, 107, 53, 0.4)',
        'glow-purple': '0 0 20px rgba(147, 51, 234, 0.3)',
        'glow-correct': '0 0 20px rgba(34, 197, 94, 0.3)',
        'glow-wrong': '0 0 20px rgba(239, 68, 68, 0.3)',
        // Card shadows
        'card': '0 8px 24px rgba(7, 12, 24, 0.42)',
        'card-hover': '0 14px 30px rgba(7, 12, 24, 0.52)',
        'card-elevated': '0 12px 30px rgba(7, 12, 24, 0.5), 0 0 0 1px rgba(159, 177, 204, 0.08)',
        'card-float': '0 18px 44px rgba(7, 12, 24, 0.6)',
        // Rank glow shadows
        'glow-rank-bronze': '0 0 20px rgba(205, 127, 50, 0.4)',
        'glow-rank-silver': '0 0 20px rgba(192, 192, 192, 0.4)',
        'glow-rank-gold': '0 0 20px rgba(255, 215, 0, 0.5)',
        'glow-rank-platinum': '0 0 20px rgba(229, 228, 226, 0.4)',
        'glow-rank-diamond': '0 0 25px rgba(185, 242, 255, 0.5)',
        'glow-rank-master': '0 0 30px rgba(153, 50, 204, 0.5)',
        'glow-rank-grandmaster': '0 0 35px rgba(255, 69, 0, 0.6)',
        // Play button special shadow
        'play-button': '0 8px 26px rgba(32, 197, 255, 0.46)',
        'play-button-lg': '0 12px 34px rgba(32, 197, 255, 0.58)',
      },

      backgroundImage: {
        // Beneficial Knowledge gradients
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'app-gradient': 'linear-gradient(180deg, #081126 0%, #12274f 52%, #0b1020 100%)',
        'gradient-main': 'linear-gradient(180deg, #081126 0%, #12274f 52%, #0b1020 100%)',
        'gradient-home': 'linear-gradient(180deg, #081126 0%, #18366a 50%, #0b1020 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(32, 197, 255, 0.1) 0%, rgba(32, 197, 255, 0.03) 100%)',
        'stat-card-gradient': 'linear-gradient(145deg, rgba(22, 34, 63, 0.9) 0%, rgba(11, 16, 32, 0.9) 100%)',
        'teal-gradient': 'linear-gradient(135deg, #20c5ff 0%, #3fd5ff 100%)',
        'play-button-gradient': 'linear-gradient(135deg, #20c5ff 0%, #15a7e0 50%, #0f8dca 100%)',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
        // Topic gradients
        'topic-1': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        'topic-2': 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
        'topic-3': 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
        'topic-4': 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
        'topic-5': 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
        'topic-6': 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
        'topic-7': 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
        // Rank gradients
        'rank-bronze': 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
        'rank-silver': 'linear-gradient(135deg, #E8E8E8 0%, #A8A8A8 100%)',
        'rank-gold': 'linear-gradient(135deg, #FFD700 0%, #DAA520 100%)',
        'rank-platinum': 'linear-gradient(135deg, #E5E4E2 0%, #A7A6A4 100%)',
        'rank-diamond': 'linear-gradient(135deg, #B9F2FF 0%, #00CED1 100%)',
        'rank-master': 'linear-gradient(135deg, #DA70D6 0%, #8B008B 100%)',
        'rank-grandmaster': 'linear-gradient(135deg, #FF6347 0%, #DC143C 100%)',
      },

      animation: {
        // Beneficial Knowledge Energetic Animations
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-out': 'fade-out 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'scale-in': 'scale-in 0.3s ease-out',
        'swoosh-left': 'swoosh-left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'swoosh-right': 'swoosh-right 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'countdown-pulse': 'countdown-pulse 0.5s ease-out',
        'answer-correct': 'answer-correct 0.3s ease-out forwards',
        'answer-wrong': 'shake 0.4s ease-out',
        'score-roll': 'score-roll 0.4s ease-out',
        'confetti': 'confetti 3s ease-in forwards',
        'victory-scale': 'victory-scale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'lightning': 'lightning 0.15s ease-out',
        'timer-critical': 'timer-critical 0.3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse-teal 2s ease-in-out infinite',
        'shake': 'shake 0.4s ease-out',
        'bounce-in': 'bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer-progress': 'shimmer-progress 2s ease-in-out infinite',
        'float-play': 'float-play 2s ease-in-out infinite',
        'pulse-online': 'pulse-online 2s ease-in-out infinite',
        'vs-reveal': 'vs-reveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'screen-enter': 'screen-enter 0.3s ease-out',
        'screen-exit': 'screen-exit 0.2s ease-in',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'swoosh-left': {
          '0%': { transform: 'translateX(-100vw) rotate(-15deg)', opacity: '0' },
          '100%': { transform: 'translateX(0) rotate(0)', opacity: '1' },
        },
        'swoosh-right': {
          '0%': { transform: 'translateX(100vw) rotate(15deg)', opacity: '0' },
          '100%': { transform: 'translateX(0) rotate(0)', opacity: '1' },
        },
        'countdown-pulse': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.3)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'answer-correct': {
          '0%': { backgroundColor: 'transparent' },
          '100%': { backgroundColor: 'rgba(34, 197, 94, 0.25)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-6px)' },
          '80%': { transform: 'translateX(6px)' },
        },
        'score-roll': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        'confetti': {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(720deg)', opacity: '0' },
        },
        'victory-scale': {
          '0%': { transform: 'scale(0) rotate(-10deg)', opacity: '0' },
          '60%': { transform: 'scale(1.2) rotate(5deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
        'lightning': {
          '0%, 100%': { opacity: '0' },
          '50%': { opacity: '1' },
        },
        'timer-critical': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
        'glow-pulse-teal': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 170, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 212, 170, 0.6)' },
        },
        'bounce-in': {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'shimmer-progress': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float-play': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-4px) scale(1.02)' },
        },
        'pulse-online': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.2)', opacity: '0.8' },
        },
        'vs-reveal': {
          '0%': { transform: 'scale(0) rotate(-180deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
        'screen-enter': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'screen-exit': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-10px)' },
        },
      },

      transitionTimingFunction: {
        'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
      },
    },
  },
  plugins: [],
}
