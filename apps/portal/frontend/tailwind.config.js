/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Page ground — a cool off-white so the white cards read as raised
        // without a border doing all the work.
        canvas: '#F4F6FC',
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        ai: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0D9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // One colour per attendance status, used ONLY by the register ribbon.
        // 700-level so the marks read as stamped rather than as candy.
        mark: {
          present: '#047857',
          absent: '#B91C1C',
          late: '#B45309',
          partial: '#6D28D9',
          excused: '#64748B',
        },
        // Semantic alias — the nav bar spec calls for bg-primary / text-primary
        // tokens. Mapped to the brand ramp so nothing hardcodes hex.
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
          DEFAULT: '#2563eb',
        }
      },
      boxShadow: {
        // Cards sit on the canvas with a low, wide shadow rather than a hard
        // border — one elevation step, no stacking.
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 20px -10px rgba(16, 24, 40, 0.14)',
        soft: '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px -16px rgba(16, 24, 40, 0.18)',
        // Coloured lift under the gradient surfaces (hero, FAB, active nav).
        hero: '0 12px 28px -12px rgba(37, 99, 235, 0.55)',
      },
      fontFamily: {
        sans: ["Inter", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        arabic: ["IBM Plex Sans Arabic", "Cairo", "system-ui", "sans-serif"],
        // Display — headings and the standing figures. Geometric Kufic reads
        // institutional and keeps the sheet from looking like every other portal.
        display: ['"Noto Kufi Arabic"', '"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        // Utility — codes, receipt numbers, class times. Monospaced so digits
        // never shuffle as values change.
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
