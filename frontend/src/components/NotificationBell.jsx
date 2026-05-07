import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'
import { useSocket } from '../context/SocketContext'

const NotificationBell = () => {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const { on, off } = useSocket() || {}
  const ref = useRef(null)

  const fetchNotifs = async () => {
    try {
      const { data } = await api.get('/notifications?limit=10')
      setNotifications(data.data.notifications)
      setUnread(data.data.unreadCount)
    } catch {}
  }

  useEffect(() => { fetchNotifs() }, [])

  useEffect(() => {
    const handler = (notif) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 10))
      setUnread((n) => n + 1)
    }
    on?.('notification', handler)
    return () => off?.('notification', handler)
  }, [on, off])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setUnread(0)
      setNotifications((n) => n.map((x) => ({ ...x, isRead: true })))
    } catch {}
  }

  const TYPE_ICON = {
    TASK_ASSIGNED: '📋',
    TASK_UPDATED: '✏️',
    TASK_COMPLETED: '✅',
    PROJECT_CREATED: '📁',
    MEMBER_ADDED: '👥',
    COMMENT_ADDED: '💬',
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) fetchNotifs() }}
        className="relative p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div key={n._id} className={`px-4 py-3 text-sm ${n.isRead ? 'bg-white' : 'bg-brand-50'}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{n.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0 mt-1" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
