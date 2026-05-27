import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import HelpDrawer from '../help/HelpDrawer';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f4fa] dark:bg-[#040a14]">
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
        <main
          className="flex-1 overflow-y-auto p-4 lg:p-6"
          style={{
            backgroundImage: isDark
              ? 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)'
              : 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        >
          <div className="max-w-screen-2xl mx-auto animate-page">
            <Outlet />
          </div>
        </main>
      </div>
      <HelpDrawer />
    </div>
  );
}
