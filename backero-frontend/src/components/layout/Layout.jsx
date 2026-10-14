import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';
import HelpDrawer from '../help/HelpDrawer';
import GlobalTimerWidget from '../tasks/GlobalTimerWidget';

function getZone(pathname) {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'zone-dashboard';
  if (pathname.startsWith('/crm'))                           return 'zone-crm';
  if (pathname.startsWith('/finance'))                       return 'zone-finance';
  if (pathname.startsWith('/inventory'))                     return 'zone-inventory';
  if (pathname.startsWith('/departments/rnd'))               return 'zone-production';
  if (pathname.startsWith('/production'))                    return 'zone-production';
  if (pathname.startsWith('/departments/hr'))                return 'zone-hr';
  if (pathname.startsWith('/departments/marketing'))         return 'zone-marketing';
  if (pathname.startsWith('/departments/marketplace'))       return 'zone-marketplace';
  if (pathname.startsWith('/departments/sales'))             return 'zone-sales';
  if (pathname.startsWith('/departments/operations'))        return 'zone-operations';
  if (pathname.startsWith('/departments'))                   return 'zone-production';
  if (pathname.startsWith('/workflow') || pathname.startsWith('/tasks')) return 'zone-tasks';
  if (pathname.startsWith('/management'))                    return 'zone-management';
  if (pathname.startsWith('/settings'))                      return 'zone-settings';
  if (pathname.startsWith('/documents'))                     return 'zone-settings';
  return 'zone-dashboard';
}

export default function Layout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const zone = getZone(location.pathname);

  return (
    <div className={`h-screen overflow-hidden bg-page ${zone}`}>
      {/* Desktop Sidebar — fixed/overlay rail, hover-expands without
          reflowing content (see Sidebar.jsx), same behavior as the
          Attendance Tracker admin-web sidebar. */}
      <aside
        className="hidden lg:block flex-shrink-0"
        style={{ position: 'fixed', insetInlineStart: 0, top: 0, height: '100vh', zIndex: 1100 }}
      >
        <Sidebar variant="desktop" />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="relative flex flex-col w-64 h-full shadow-2xl">
            <Sidebar variant="mobile" onNavigate={() => setMobileSidebarOpen(false)} onClose={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content — constant left margin sized to the collapsed rail
          only (72px, must match SIDER_COLLAPSED_WIDTH), so the sidebar
          floats above content when hover-expanded instead of pushing it.
          A single mounted tree here (toggled by CSS breakpoint, not by
          conditional rendering) avoids double-mounting the Outlet/queries. */}
      <div className="flex flex-col h-full overflow-hidden lg:ms-[72px]">
        <Header onMobileMenuToggle={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6" style={{ background: '#f5f5f5' }}>
          <div className="w-full animate-page">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav onMenuOpen={() => setMobileSidebarOpen(true)} />
      <HelpDrawer />
      <GlobalTimerWidget />
    </div>
  );
}
