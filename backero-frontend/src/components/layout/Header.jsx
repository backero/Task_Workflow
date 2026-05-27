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

const HEADER_BG = '#0c1445';

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const toggleDark = () => {
    const nowDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('backero-theme', nowDark ? 'dark' : 'light');
    setIsDark(nowDark);
  };

  const { data: waStatus } = useQuery({
    queryKey: ['wa-status-header'],
    queryFn: () => api.get('/whatsapp/status').then((r) => r.data),
    refetchInterval: 30000,
    staleTime: 20000,
    enabled: isAdmin,
    retry: false,
  });

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
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

  const iconBtn = 'p-2 rounded-xl transition-colors text-white/50 hover:text-white/90';
  const iconBtnStyle = { ':hover': {} };

  return (
    <header
      className="relative z-20 h-14 flex-shrink-0 flex items-center px-4 lg:px-5 gap-3"
      style={{ background: HEADER_BG, borderBottom: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden p-2 rounded-xl text-white/50 hover:text-white/90 transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Global search */}
      <div className="flex-1 max-w-sm relative" ref={searchRef}>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search tasks, leads…"
            className="w-full pl-9 pr-8 py-2 rounded-xl text-sm text-white/80 placeholder-white/30 focus:outline-none transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onFocusCapture={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onBlur={e => { if (!showSearch) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; } }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDebouncedSearch(''); setShowSearch(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {showSearch && debouncedSearch.length >= 2 && (
          <div className="absolute top-11 left-0 right-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-2xl z-50 overflow-hidden animate-slide-down">
            {searching && !searchResults ? (
              <div className="p-4 text-sm text-slate-400 text-center">Searching…</div>
            ) : !searchResults?.data?.length ? (
              <div className="p-4 text-sm text-slate-400 text-center">No results for "{debouncedSearch}"</div>
            ) : (
              <>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-1">Tasks</p>
                {searchResults.data.map((task) => (
                  <button
                    key={task._id}
                    onClick={() => { navigate(`/workflow/${task._id}`); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.status === 'Completed' ? 'bg-emerald-500' : task.isOverdue ? 'bg-red-500' : 'bg-blue-400'
                      }`} />
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-4 text-xs text-slate-400">
                      <span>{task.department}</span>
                      <span>·</span>
                      <span>{task.status}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 ml-auto">
        {/* WhatsApp status */}
        {isAdmin && waStatus !== undefined && (
          <button
            onClick={() => navigate('/settings/whatsapp')}
            title={waConnected ? 'WhatsApp connected' : 'WhatsApp disconnected'}
            className="relative p-2 rounded-xl text-white/50 hover:text-white/90 transition-colors"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <DevicePhoneMobileIcon style={{ width: '18px', height: '18px' }} />
            <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ${
              waConnected
                ? 'bg-emerald-400 ring-emerald-900'
                : 'bg-red-400 ring-red-900'
            }`} />
          </button>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          title={isDark ? 'Light mode' : 'Dark mode'}
          className="p-2 rounded-xl text-white/50 hover:text-white/90 transition-colors"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {isDark
            ? <SunIcon style={{ width: '18px', height: '18px' }} className="text-amber-400" />
            : <MoonIcon style={{ width: '18px', height: '18px' }} />
          }
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs((p) => !p)}
            className="relative p-2 rounded-xl text-white/50 hover:text-white/90 transition-colors"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <BellIcon style={{ width: '18px', height: '18px' }} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
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

        {/* Divider */}
        <div className="w-px h-6 mx-1.5" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu((p) => !p)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#22c55e,#15803d)' }}
            >
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[13px] font-semibold text-white/80 leading-tight">{user?.firstName}</p>
              <p className="text-[10px] text-white/35 capitalize leading-tight">{user?.role?.replace('_', ' ')}</p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 z-50 w-52 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-2xl py-1.5 overflow-hidden animate-slide-down">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-400 capitalize mt-0.5">{user?.role?.replace('_', ' ')}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
