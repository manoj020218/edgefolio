/** @type {import('tailwindcss').Config} */
// 2026 UI refresh tokens (see APK/UI_REFRESH_2026.md).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#5b4ff0',
          700: '#4f46e5',
          800: '#3730a3',
          900: '#1e1b4b',
        },
        surface: {
          bg: '#07080d',
          DEFAULT: 'rgba(255,255,255,0.045)',
          light: 'rgba(255,255,255,0.09)',
          raised: '#11131c',
        },
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#fb7185',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '28px',
      },
      boxShadow: {
        glow: '0 10px 40px -10px rgba(99,102,241,0.55)',
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #22d3ee 100%)',
      },
      keyframes: {
        enter: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(52,211,153,0.55)' },
          '100%': { boxShadow: '0 0 0 10px rgba(52,211,153,0)' },
        },
      },
      animation: {
        enter: 'enter 260ms ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
