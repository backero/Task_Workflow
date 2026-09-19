/**
 * Backero Employee Portal — independent design tokens.
 *
 * Deliberately NOT imported from @backero/shared-config/theme, and
 * deliberately not shared with apps/admin-web's own copy of this file
 * either (`primary` is orange here vs. admin-web's blue) — the two apps
 * are visually distinct on purpose so users can tell them apart at a
 * glance. `apps/mobile` keeps using shared-config unchanged.
 */

export const primary = {
  base: '#EA580C',
  hover: '#F97316',
  active: '#C2410C',
} as const;

/** Reused anywhere a literal gradient (not a flat fill) is wanted —
 * primary buttons, the sidebar's active-item chip, etc. */
export const primaryGradient = 'linear-gradient(135deg, #C2410C 0%, #EA580C 55%, #F97316 100%)';

/** 10-step slate neutral scale. */
export const neutral = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

export const surface = '#FFFFFF';

export const text = {
  primary: neutral[900],
  secondary: neutral[600],
  disabled: neutral[400],
  onPrimary: surface,
} as const;

export const destructive = '#DC2626';

export const typography = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
} as const;

export const radius = {
  sm: 4,
  base: 6,
  lg: 8,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
