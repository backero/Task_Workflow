import type {ThemeConfig} from 'antd';

import {destructive, neutral, primary, radius, spacing, text, typography} from './palette';

/**
 * Ant Design ConfigProvider theme. No ambient card/table shadows — surfaces
 * are separated by a 1px border + background contrast; shadow is reserved
 * for genuinely floating layers (Drawer/Modal/Dropdown/Tooltip), left at
 * antd's own default token rather than hand-rolled tiers.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: primary.base,
    colorPrimaryHover: primary.hover,
    colorPrimaryActive: primary.active,
    colorError: destructive,
    colorTextBase: text.primary,
    colorTextSecondary: text.secondary,
    colorTextDisabled: text.disabled,
    colorBgLayout: neutral[50],
    colorBgContainer: '#FFFFFF',
    colorBorder: neutral[200],
    colorBorderSecondary: neutral[100],
    fontFamily: typography.fontFamily,
    fontSize: 14,
    borderRadius: radius.base,
    borderRadiusLG: radius.lg,
    borderRadiusSM: radius.sm,
    padding: spacing.md,
    paddingLG: spacing.lg,
    marginLG: spacing.lg,
    wireframe: false,
    // The sidebar is a fixed-position overlay (components/Layout.tsx,
    // zIndex 1100). Popups (Drawer/Modal/Dropdown/Tooltip/Select) must
    // always render above it, so their base is raised to clear it.
    zIndexPopupBase: 1200,
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      bodyBg: neutral[50],
      siderBg: '#FFFFFF',
    },
    Menu: {
      itemMarginBlock: 8,
      itemHeight: 44,
    },
    Table: {
      headerBg: neutral[50],
      headerColor: text.secondary,
      rowHoverBg: neutral[50],
      borderColor: neutral[200],
      boxShadow: 'none',
    },
    Card: {
      boxShadowTertiary: 'none',
    },
    Button: {
      controlHeight: 36,
      fontWeight: typography.weight.medium,
    },
  },
};
