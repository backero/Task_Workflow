// Ant Design theme tokens for the new Workflow (v2) UI — carries over
// Task_Workflow's own existing "Prism" brand, recolored to the Backero logo's
// green (see src/index.css --brand/--grad-brand/--s-page/--s-card/chrome-bg),
// not the Attendance Tracker's palette. Colors below are read directly from
// those CSS tokens.

export const workflowTheme = {
  token: {
    colorPrimary: '#669c2c',
    colorInfo: '#669c2c',
    colorLink: '#669c2c',
    colorSuccess: '#059669',
    colorWarning: '#b45309',
    colorError: '#dc2626',
    colorTextBase: '#1c1917',
    colorBgLayout: '#f1ede4',
    colorBgContainer: '#fbfaf7',
    colorBorder: 'rgba(28,25,23,0.12)',
    colorBorderSecondary: 'rgba(28,25,23,0.08)',
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    // Sidebar.jsx's desktop rail is position:fixed with z-index 1100 (so it floats above
    // content when hover-expanded, per Layout.jsx) — that's higher than antd's default
    // popup base (1000), so every Modal/Drawer/Dropdown in the app rendered *underneath*
    // the sidebar. Raise the base so all antd overlays clear it.
    zIndexPopupBase: 1200,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
  },
  components: {
    Layout: {
      siderBg: '#05101e',
      headerBg: 'rgba(255,255,255,0.92)',
      bodyBg: '#f1ede4',
    },
    Menu: {
      darkItemBg: '#05101e',
      darkItemSelectedBg: 'rgba(102,156,44,0.16)',
      darkItemSelectedColor: '#b6de8b',
      darkItemColor: 'rgba(255,255,255,0.55)',
      darkItemHoverColor: 'rgba(255,255,255,0.85)',
      darkSubMenuItemBg: 'transparent',
    },
    Card: {
      colorBgContainer: '#fbfaf7',
      boxShadowTertiary: '0 2px 8px rgba(15,23,42,0.07)',
    },
    Button: {
      borderRadius: 10,
      controlHeight: 38,
      primaryShadow: '0 2px 10px rgba(102,156,44,0.24)',
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
};

export const brand = {
  gradient: 'linear-gradient(135deg,#4b7320 0%,#669c2c 50%,#90cd4f 100%)',
  page: '#f1ede4',
  card: '#fbfaf7',
  chrome: 'linear-gradient(160deg, #05101e 0%, #091726 40%, #05101e 100%)',
};
