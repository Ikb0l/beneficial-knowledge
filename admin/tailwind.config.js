/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Admin panel color scheme
        primary: {
          50: '#edf4ff',
          100: '#dbe9ff',
          200: '#bed8ff',
          300: '#93bcff',
          400: '#6497f8',
          500: '#4a7de9',
          600: '#3a65d0',
          700: '#2f51af',
          800: '#2a448d',
          900: '#263d74',
          DEFAULT: '#4a7de9',
        },
        accent: {
          50: '#effaf9',
          100: '#d2f3ef',
          200: '#a8e5dc',
          300: '#74d0c5',
          400: '#41b4aa',
          500: '#2f9890',
          600: '#277a74',
          700: '#235f5b',
          800: '#224b48',
          900: '#1f3f3d',
          DEFAULT: '#2f9890',
        },
        surface: {
          app: '#eef3f9',
          panel: '#ffffff',
          soft: '#f6f9fd',
          glass: 'rgba(255, 255, 255, 0.75)',
          border: 'rgba(148, 163, 184, 0.26)',
        },
        // Sidebar
        sidebar: {
          bg: '#101b34',
          hover: '#1d2a48',
          active: '#345dba',
        },
        // Status colors
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        // Difficulty colors (for questions)
        difficulty: {
          easy: '#22c55e',
          medium: '#f59e0b',
          hard: '#ef4444',
        },
        // Rank colors
        rank: {
          bronze: '#cd7f32',
          silver: '#c0c0c0',
          gold: '#ffd700',
          platinum: '#e5e4e2',
          diamond: '#b9f2ff',
          master: '#9932cc',
          grandmaster: '#ff4500',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        display: ['"Sora"', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 10px 30px rgba(15, 23, 42, 0.10)',
        soft: '0 4px 18px rgba(15, 23, 42, 0.08)',
        lift: '0 16px 36px rgba(15, 23, 42, 0.16)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      transitionTimingFunction: {
        polished: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
