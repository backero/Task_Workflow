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
  return 'zone-dashboard';
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const zone = getZone(location.pathname);

  return (
    <div className={`flex h-screen overflow-hidden bg-page ${zone}`}>
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 ${sidebarOpen ? 'w-64' : 'w-16'}`}>
        <Sidebar collapsed={!sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="relative flex flex-col w-64 h-full shadow-2xl">
            <Sidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          sidebarOpen={sidebarOpen}
          onMobileMenuToggle={() => setMobileSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6 dot-grid">
          <div className="max-w-screen-2xl mx-auto animate-page">
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
