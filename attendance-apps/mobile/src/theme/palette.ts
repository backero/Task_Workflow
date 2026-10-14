/**
 * Backero Mobile — independent design tokens, matching apps/employee-web's
 * orange-gradient identity (deliberately NOT @backero/shared-config's old
 * navy/green brand — the employee-facing surfaces, web and native, now share
 * one look). Not imported from employee-web's copy either — each app keeps
 * an independent theme file per the monorepo's established pattern.
 */

export const primary = {
  base: '#EA580C',
  hover: '#F97316',
  active: '#C2410C',
} as const;

/** 10-step slate neutral scale — identical values to employee-web's. */
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
  fontFamily: 'System', // Roboto on Android by default; avoids paying webfont weight on mobile
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  scale: {
    h1: {size: 24, weight: '600', color: text.primary},
    h2: {size: 18, weight: '500', color: text.primary},
    h3: {size: 15, weight: '500', color: text.primary},
    body: {size: 14, weight: '400', color: text.primary},
    dataLabel: {size: 13, weight: '500', color: text.primary},
    caption: {size: 12.5, weight: '400', color: text.secondary},
    tagline: {size: 12, weight: '400', color: text.secondary},
  },
} as const;

export const radius = {
  card: 12,
  badge: 999, // pill
  button: 10,
  input: 10,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  sm: {shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1},
  md: {shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4},
} as const;

export const components = {
  button: {
    primary: {bg: primary.base, text: surface},
    secondary: {bg: 'transparent', border: neutral[200], text: primary.base},
    destructive: {bg: destructive, text: surface},
  },
  card: {bg: surface, border: neutral[200], radius: radius.card},
} as const;

export const theme = {
  primary,
  neutral,
  surface,
  text,
  destructive,
  typography,
  radius,
  spacing,
  shadow,
  components,
} as const;

export type Theme = typeof theme;

export default theme;
