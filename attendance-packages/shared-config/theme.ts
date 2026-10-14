/**
 * Backero brand design tokens — the single source of truth (spec §26).
 * Consumed directly by React Native (StyleSheet objects) and, via
 * `buildCssVariables()` / the `generate-css.ts` build step, by the web
 * portals as CSS custom properties. No screen/component anywhere in the
 * monorepo should declare a raw hex literal outside this file — enforced by
 * an ESLint rule activated once component code exists (Phase 5/8).
 */

export const brand = {
  navy: "#092143",
  green: "#669C2C",
  grey: "#6B6B6B",
  white: "#FFFFFF",
} as const;

export const navyRamp = {
  50: "#EAEDF2",
  100: "#C7CEDB",
  500: "#092143",
  700: "#071A34",
  900: "#050F20",
} as const;

export const greenRamp = {
  50: "#EAF3DE",
  100: "#C0DD97",
  500: "#669C2C",
  700: "#3B6D11",
  900: "#1B3308",
} as const;

export const greyRamp = {
  50: "#F5F5F5",
  100: "#E4E4E4",
  400: "#9A9A9A",
  600: "#6B6B6B",
  900: "#2B2B2B",
} as const;

/**
 * Semantic (status) colors — deliberately outside the brand ramps so
 * LATE/ABSENT never render in brand green (spec §26.3).
 */
export const semanticStatus = {
  present: { bg: "#EAF3DE", text: "#3B6D11" },
  late: { bg: "#FEF3C7", text: "#B45309" },
  absent: { bg: "#FEE2E2", text: "#B91C1C" },
  onLeave: { bg: "#F0F0F0", text: "#6B6B6B" },
  missingPunch: { bg: "#FEF3C7", text: "#B45309" },
  halfDay: { bg: navyRamp[50], text: navyRamp[700] },
  holiday: { bg: greyRamp[50], text: greyRamp[600] },
  weekOff: { bg: greyRamp[50], text: greyRamp[600] },
  incomplete: { bg: "#FEF3C7", text: "#B45309" },
  deviceOnline: greenRamp[500],
  deviceOffline: greyRamp[400],
  deviceUnknown: { bg: greyRamp[100], text: greyRamp[600] },
  destructive: "#B91C1C",
} as const;

export const typography = {
  fontFamily: {
    web: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    native: "System", // Roboto on Android by default; avoids paying webfont weight on mobile
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
  },
  scale: {
    h1: { size: 24, weight: "600", color: navyRamp[500] },
    h2: { size: 18, weight: "500", color: navyRamp[500] },
    h3: { size: 15, weight: "500", color: navyRamp[500] },
    body: { size: 14, weight: "400", color: greyRamp[900] },
    dataLabel: { size: 13, weight: "500", color: greyRamp[900] },
    caption: { size: 12.5, weight: "400", color: greyRamp[600] },
    tagline: { size: 12, weight: "400", color: greyRamp[600], letterSpacing: 0.02 },
  },
} as const;

export const radius = {
  card: 10, // 8-12px per spec — soft, matches rounded logo letterforms
  badge: 999, // pill
  button: 8,
  input: 8,
  modal: 12,
  bottomSheet: 16, // RN modal sheets — softer than card, per platform sheet idiom
};

/**
 * Elevation scale — navy-tinted (never pure black) so depth stays in-brand.
 * Shared by web (box-shadow) and native (elevation/shadowColor) consumers.
 */
export const shadow = {
  sm: "0 1px 2px rgba(9,33,67,0.06)", // resting cards / rows
  md: "0 4px 12px rgba(9,33,67,0.10)", // popovers / modals / dropdowns
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const components = {
  button: {
    primary: { bg: navyRamp[500], text: brand.white, hoverBg: navyRamp[700] },
    accent: { bg: greenRamp[500], text: brand.white }, // reserved for positive/active attendance actions ONLY
    secondary: { bg: "transparent", border: greyRamp[100], text: navyRamp[500] },
    destructive: { bg: semanticStatus.destructive, text: brand.white },
  },
  nav: {
    sidebarBg: navyRamp[500],
    sidebarText: brand.white,
    sidebarTextMuted: navyRamp[50],
    activeIndicator: greenRamp[500], // left-border accent, never a full fill
    topBarBg: brand.white,
    topBarBorder: greyRamp[100],
  },
  card: {
    bg: brand.white,
    border: greyRamp[100],
    radius: radius.card,
  },
  // Data tables: rely on hover + sticky header + borders, deliberately no
  // zebra striping — less visual noise per redesign brief.
  table: {
    headerBg: greyRamp[50],
    rowHoverBg: navyRamp[50],
    stickyHeaderShadow: shadow.sm,
    cellPadding: spacing.md,
  },
  focusRing: {
    color: navyRamp[500], // not green — reserved for positive/active attendance actions
    width: 2,
    offset: 2,
  },
  skeleton: {
    bg: greyRamp[50],
    highlight: greyRamp[100],
  },
  // Built by referencing semanticStatus fills directly so chart slices always
  // agree with StatusBadge colors — no separately-chosen chart palette.
  chart: {
    palette: [
      semanticStatus.present.bg,
      semanticStatus.late.bg,
      semanticStatus.absent.bg,
      semanticStatus.onLeave.bg,
      semanticStatus.halfDay.bg,
      semanticStatus.incomplete.bg,
    ],
  },
  liveMap: {
    activeDot: greenRamp[500],
    activePulseRing: greenRamp[50],
    idleDot: greyRamp[400],
  },
} as const;

export const theme = {
  brand,
  navyRamp,
  greenRamp,
  greyRamp,
  semanticStatus,
  typography,
  radius,
  spacing,
  shadow,
  components,
} as const;

export type Theme = typeof theme;

/**
 * Flattens the token tree into CSS custom-property name/value pairs, e.g.
 * `--color-navy-500: #092143`. Used by `generate-css.ts` to emit a single
 * `:root { ... }` stylesheet consumed by admin-web/employee-web, so tokens
 * and runtime CSS never drift apart (spec §26.6).
 */
export function buildCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  const rampEntries: [string, Record<number, string>][] = [
    ["navy", navyRamp],
    ["green", greenRamp],
    ["grey", greyRamp],
  ];
  for (const [name, ramp] of rampEntries) {
    for (const [shade, hex] of Object.entries(ramp)) {
      vars[`--color-${name}-${shade}`] = hex;
    }
  }

  vars["--color-brand-navy"] = brand.navy;
  vars["--color-brand-green"] = brand.green;
  vars["--color-brand-grey"] = brand.grey;
  vars["--color-brand-white"] = brand.white;

  for (const [status, value] of Object.entries(semanticStatus)) {
    if (typeof value === "string") {
      vars[`--color-status-${status}`] = value;
    } else {
      vars[`--color-status-${status}-bg`] = value.bg;
      vars[`--color-status-${status}-text`] = value.text;
    }
  }

  vars["--font-family-web"] = typography.fontFamily.web;
  vars["--radius-card"] = `${radius.card}px`;
  vars["--radius-badge"] = `${radius.badge}px`;
  vars["--radius-button"] = `${radius.button}px`;
  vars["--radius-input"] = `${radius.input}px`;
  vars["--radius-modal"] = `${radius.modal}px`;
  vars["--radius-bottom-sheet"] = `${radius.bottomSheet}px`;

  vars["--shadow-sm"] = shadow.sm;
  vars["--shadow-md"] = shadow.md;

  vars["--focus-ring-color"] = components.focusRing.color;
  vars["--focus-ring-width"] = `${components.focusRing.width}px`;
  vars["--focus-ring-offset"] = `${components.focusRing.offset}px`;

  for (const [key, value] of Object.entries(spacing)) {
    vars[`--space-${key}`] = `${value}px`;
  }

  return vars;
}

export default theme;
