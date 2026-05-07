import { useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import Sidebar from './Sidebar'
import NotificationBell from './NotificationBell'
import SearchBar from './SearchBar'
import { useAuth } from '../context/AuthContext'

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/projects':   'Projects',
  '/my-tasks':   'My Tasks',
  '/analytics':  'Analytics',
  '/employees':  'Employees',
  '/inventory':  'Inventory',
  '/finance':    'Finance',
  '/reports':    'Reports & Analytics',
  '/members':    'Members',
  '/settings':   'Settings',
  '/profile':    'My Profile',
}

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const location  = useLocation()

  const pathKey  = '/' + location.pathname.split('/')[1]
  const title    = PAGE_TITLES[pathKey] || 'Backero'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 flex-shrink-0">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar — shared mobile + desktop */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2 flex items-center gap-3 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page title — desktop */}
          <h1 className="hidden lg:block text-base font-semibold text-gray-900 flex-shrink-0">{title}</h1>

          {/* Search — grows to fill space */}
          <div className="flex-1 max-w-md">
            <SearchBar />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <NotificationBell />

            {/* User avatar — desktop only */}
            <NavLink to="/profile" className="hidden lg:flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {(user?.name?.[0] || user?.phone?.[3] || 'U').toUpperCase()}
              </div>
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
