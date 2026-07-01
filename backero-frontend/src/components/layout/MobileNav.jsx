import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  HomeIcon, BoltIcon, ClipboardDocumentListIcon, CogIcon, Bars3Icon,
} from '@heroicons/react/24/outline';
import { useNotificationStore } from '../../store/useNotificationStore';

const TABS = [
  { label: 'Home',     to: '/',          icon: HomeIcon,                    exact: true },
  { label: 'Workflow', to: '/workflow',   icon: BoltIcon },
  { label: 'My Tasks', to: '/tasks/my',  icon: ClipboardDocumentListIcon },
  { label: 'Settings', to: '/settings',  icon: CogIcon },
];

export default function MobileNav({ onMenuOpen }) {
  const { unreadCount } = useNotificationStore();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-slate-200 dark:border-[#1b2e4a] bg-white dark:bg-[#070c17]"
      style={{ height: '56px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ label, to, icon: Icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <Icon className="w-5 h-5" />
          {label}
        </NavLink>
      ))}

      {/* More — opens full sidebar overlay */}
      <button
        onClick={onMenuOpen}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 relative"
      >
        <span className="relative">
          <Bars3Icon className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        More
      </button>
    </nav>
  );
}
