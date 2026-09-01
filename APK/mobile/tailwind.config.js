/** @type {import('tailwindcss').Config} */
// Tokens mirrored from ../../DESIGN_SYSTEM_GUIDE.md so the phone app matches
// the EDGE desktop UI. Keep in sync if the guide changes.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c3d66',
        },
        surface: {
          bg: '#0f172a',
          DEFAULT: '#1e293b',
          light: '#334155',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
      },
    },
  },
  plugins: [],
};
