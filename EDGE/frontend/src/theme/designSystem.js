/**
 * EDGEFOLIO - Design System Tokens
 * Modern, Dark-First Color Palette with Accessibility
 * Based on: Tailwind CSS + Custom Brand Colors
 */

export const COLORS = {
  // Primary Brand Colors (Sky Blue)
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9', // Primary
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c3d66',
  },

  // Secondary Brand Colors (Slate)
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },

  // Semantic Colors
  success: {
    50: '#f0fdf4',
    500: '#10b981',
    600: '#059669',
    900: '#065f46',
  },

  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
    900: '#78350f',
  },

  danger: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    900: '#7f1d1d',
  },

  info: {
    50: '#eff6ff',
    500: '#3b82f6',
    600: '#2563eb',
    900: '#1e3a8a',
  },

  // Dark Mode (Default)
  background: '#0f172a', // slate-900
  surface: '#1e293b',    // slate-800
  surfaceLight: '#334155', // slate-700
  text: '#f1f5f9',       // slate-100
  textSecondary: '#cbd5e1', // slate-300
  border: '#334155',     // slate-700
};

export const TYPOGRAPHY = {
  // Font families
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", monospace',
  },

  // Font sizes with line heights
  fontSize: {
    xs: { size: '0.75rem', lineHeight: '1rem' },      // 12px
    sm: { size: '0.875rem', lineHeight: '1.25rem' },  // 14px
    base: { size: '1rem', lineHeight: '1.5rem' },     // 16px
    lg: { size: '1.125rem', lineHeight: '1.75rem' },  // 18px
    xl: { size: '1.25rem', lineHeight: '1.75rem' },   // 20px
    '2xl': { size: '1.5rem', lineHeight: '2rem' },    // 24px
    '3xl': { size: '1.875rem', lineHeight: '2.25rem' }, // 30px
    '4xl': { size: '2.25rem', lineHeight: '2.5rem' }, // 36px
    '5xl': { size: '3rem', lineHeight: '1' },         // 48px
  },

  // Font weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  // Semantic sizes
  heading: {
    h1: { size: '2.5rem', weight: 700, lineHeight: 1.1 },
    h2: { size: '2rem', weight: 700, lineHeight: 1.2 },
    h3: { size: '1.5rem', weight: 600, lineHeight: 1.3 },
    h4: { size: '1.25rem', weight: 600, lineHeight: 1.4 },
  },

  body: {
    lg: { size: '1.125rem', weight: 400 },
    md: { size: '1rem', weight: 400 },
    sm: { size: '0.875rem', weight: 400 },
  },

  label: {
    md: { size: '0.875rem', weight: 600 },
    sm: { size: '0.75rem', weight: 600 },
  },
};

export const SPACING = {
  // 8px grid system
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
};

export const SHADOWS = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};

export const BORDER_RADIUS = {
  none: '0',
  sm: '0.125rem',  // 2px
  md: '0.375rem',  // 6px
  lg: '0.5rem',    // 8px
  xl: '0.75rem',   // 12px
  '2xl': '1rem',   // 16px
  full: '9999px',
};

export const TRANSITIONS = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
};

export const Z_INDEX = {
  hide: '-1',
  base: '0',
  dropdown: '1000',
  sticky: '1020',
  fixed: '1030',
  backdrop: '1040',
  modal: '1050',
  popover: '1060',
  tooltip: '1070',
};

// Component-specific tokens
export const BUTTON = {
  sizes: {
    xs: {
      padding: '0.25rem 0.75rem',
      fontSize: '0.75rem',
      height: '1.75rem',
    },
    sm: {
      padding: '0.375rem 0.875rem',
      fontSize: '0.875rem',
      height: '2rem',
    },
    md: {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      height: '2.5rem',
    },
    lg: {
      padding: '0.75rem 1.5rem',
      fontSize: '1rem',
      height: '3rem',
    },
    xl: {
      padding: '1rem 2rem',
      fontSize: '1.125rem',
      height: '3.5rem',
    },
  },
};

export const INPUT = {
  sizes: {
    sm: {
      padding: '0.375rem 0.75rem',
      fontSize: '0.875rem',
      height: '2rem',
    },
    md: {
      padding: '0.5rem 0.875rem',
      fontSize: '0.875rem',
      height: '2.5rem',
    },
    lg: {
      padding: '0.75rem 1rem',
      fontSize: '1rem',
      height: '3rem',
    },
  },
};

export const TABLE = {
  headerBackground: '#1e293b',
  headerText: '#f1f5f9',
  rowBackground: '#0f172a',
  rowHoverBackground: '#1e293b',
  rowBorder: '#334155',
  padding: '0.75rem 1rem',
};

export const CARD = {
  background: '#1e293b',
  border: '#334155',
  borderRadius: '0.75rem',
  padding: '1.5rem',
  shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

export const BADGE = {
  padding: '0.25rem 0.75rem',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  fontWeight: 600,
};
