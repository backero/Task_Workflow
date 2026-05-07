import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrg }  from '../context/OrgContext'
import { useSocket } from '../context/SocketContext'

const ICONS = {
  dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  projects:   'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  mytasks:    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  analytics:  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  employees:  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  inventory:  'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  finance:    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  reports:    'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z',
  production: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  members:    'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  settings:   'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const NavIcon = ({ name }) => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    {ICONS[name].split('M').filter(Boolean).map((d, i) => (
      <path key={i} strokeLinecap="round" strokeLinejoin="round" d={`M${d}`} />
    ))}
  </svg>
)

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard',  icon: 'dashboard' },
      { to: '/projects',  label: 'Projects',   icon: 'projects'  },
      { to: '/my-tasks',  label: 'My Tasks',   icon: 'mytasks'   },
      { to: '/analytics', label: 'Analytics',  icon: 'analytics' },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/employees',  label: 'Employees',  icon: 'employees'  },
      { to: '/inventory',  label: 'Inventory',  icon: 'inventory'  },
      { to: '/production', label: 'Production', icon: 'production' },
      { to: '/finance',    label: 'Finance',    icon: 'finance'    },
      { to: '/reports',    label: 'Reports',    icon: 'reports'    },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/members',  label: 'Members',  icon: 'members'  },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

const Sidebar = ({ onClose }) => {
  const { user, logout } = useAuth()
  const { org }          = useOrg()
  const { connected }    = useSocket()
  const navigate         = useNavigate()

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white w-56">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-base flex-shrink-0 shadow-lg">
            B
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{org?.name || 'Backero'}</p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{org?.slug || 'Workflow Platform'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <NavIcon name={icon} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Socket status */}
      <div className="px-4 py-1.5 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
        <span className="text-xs text-gray-500">{connected ? 'Live' : 'Offline'}</span>
      </div>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <NavLink to="/profile" onClick={onClose} className="flex items-center gap-2.5 mb-2.5 group">
          <div className="w-8 h-8 bg-indigo-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 group-hover:ring-2 group-hover:ring-indigo-400 transition-all">
            {(user?.name?.[0] || user?.phone?.[3] || 'U').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-indigo-300 transition-colors">{user?.name || 'New User'}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace(/_/g, ' ')?.toLowerCase()}</p>
          </div>
        </NavLink>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 px-1 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )
}

export default Sidebar
