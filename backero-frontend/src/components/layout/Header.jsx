import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bars3Icon, BellIcon, MagnifyingGlassIcon, SunIcon, MoonIcon,
  ArrowRightOnRectangleIcon, DevicePhoneMobileIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import { useNotificationStore } from '../../store/useNotificationStore';
import NotificationCenter from '../common/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';

export default function Header({ onMobileMenuToggle }) {
  const { user, logout } = useAuthStore();
  const { isAdmin } = usePermissions();
  const { unreadCount } = useNotificationStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('backero-theme');
    if (stored) return stored === 'dark';
    return document.documentElement.classList.contains('dark');
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const toggleDark = () => {
    const nowDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('backero-theme', nowDark ? 'dark' : 'light');
    setIsDark(nowDark);
  };

  // WhatsApp connection status — admin+ only, poll every 30s
  const { data: waStatus } = useQuery({
    queryKey: ['wa-status-header'],
    queryFn: () => api.get('/whatsapp/status').then((r) => r.data),
    refetchInterval: 30000,
    staleTime: 20000,
    enabled: isAdmin,
    retry: false,
  });

  // Global task search
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['global-search', debouncedSearch],
    queryFn: () => api.get('/tasks', { params: { search: debouncedSearch, limit: 6 } }).then((r) => r.data),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30000,
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
  };

  const waConnected = waStatus?.connected;

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 lg:px-6 gap-4 flex-shrink-0">
      {/* Mobile menu toggle */}
      <button onClick={onMobileMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
        <Bars3Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>

      {/* Global search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search tasks, leads, products..."
            className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white dark:focus:bg-gray-700 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDebouncedSearch(''); setShowSearch(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <XMarkIcon className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Search dropdown */}
        {showSearch && debouncedSearch.length >= 2 && (
          <div className="absolute top-11 left-0 right-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-modal z-50 overflow-hidden">
            {searching && !searchResults ? (
              <div className="p-3 text-sm text-gray-400 text-center">Searching…</div>
            ) : !searchResults?.data?.length ? (
              <div className="p-3 text-sm text-gray-400 text-center">No results for "{debouncedSearch}"</div>
            ) : (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1">Tasks</p>
                {searchResults.data.map((task) => (
                  <button
                    key={task._id}
                    onClick={() => { navigate(`/workflow/${task._id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.status === 'Completed' ? 'bg-green-500' : task.isOverdue ? 'bg-red-500' : 'bg-blue-400'
                      }`} />
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-4 text-xs text-gray-400">
                      <span>{task.department}</span>
                      <span>·</span>
                      <span>{task.status}</span>
                      {task.assignedTo && <span>· {task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* WhatsApp status — admin only */}
        {isAdmin && waStatus !== undefined && (
          <button
            onClick={() => navigate('/settings/whatsapp')}
            title={waConnected ? 'WhatsApp connected' : 'WhatsApp disconnected — click to fix'}
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <DevicePhoneMobileIcon className={`w-5 h-5 ${waConnected ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`} />
            <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 ${
              waConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
          </button>
        )}

        {/* Dark mode toggle */}
        <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          {isDark
            ? <SunIcon className="w-5 h-5 text-yellow-500" />
            : <MoonIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          }
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs((p) => !p)}
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <BellIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-12 z-50 w-96 animate-slide-down">
              <NotificationCenter onClose={() => setShowNotifs(false)} />
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu((p) => !p)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <span className="text-brand-700 dark:text-brand-400 font-semibold text-xs">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.firstName}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 z-50 w-48 card shadow-modal py-1 animate-slide-down">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
