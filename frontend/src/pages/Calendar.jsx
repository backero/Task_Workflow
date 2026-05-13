import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'
import TaskDetailModal from '../components/modals/TaskDetailModal'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const PRIORITY_COLOR = {
  LOW:    'bg-green-100 text-green-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH:   'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

const Calendar = () => {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState(null)

  useEffect(() => {
    const from = new Date(year, month, 1).toISOString()
    const to   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    api.get(`/tasks?dueAfter=${from}&dueBefore=${to}&limit=300`)
      .then(({ data }) => setTasks(data.data.tasks))
      .catch(console.error)
  }, [year, month])

  const tasksByDay = useMemo(() => {
    const map = {}
    tasks.forEach((t) => {
      if (!t.dueDate) return
      const d = new Date(t.dueDate).getDate()
      if (!map[d]) map[d] = []
      map[d].push(t)
    })
    return map
  }, [tasks])

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const cells = []
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 text-sm mt-0.5">Tasks by due date</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">‹</button>
          <span className="text-sm font-semibold text-gray-800 min-w-[140px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">›</button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
            className="ml-2 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium"
          >
            Today
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS.map((d) => (
            <div key={d} className="px-3 py-2.5 text-xs font-semibold text-gray-400 text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="min-h-[120px] bg-gray-50/50" />
            }
            const dayTasks = tasksByDay[day] || []
            return (
              <div key={day} className={`min-h-[120px] p-2 ${isToday(day) ? 'bg-brand-50' : 'hover:bg-gray-50'} transition-colors`}>
                <div className={`text-xs font-bold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday(day) ? 'bg-brand-600 text-white' : 'text-gray-500'
                }`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t._id}
                      onClick={() => setSelectedTaskId(t._id)}
                      className={`w-full text-left text-xs px-1.5 py-0.5 rounded font-medium truncate transition-opacity hover:opacity-80 ${PRIORITY_COLOR[t.priority]}`}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-xs text-gray-400 pl-1">+{dayTasks.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
          {/* Pad remaining cells */}
          {Array.from({ length: (7 - (cells.length % 7)) % 7 }).map((_, i) => (
            <div key={`tail-${i}`} className="min-h-[120px] bg-gray-50/50" />
          ))}
        </div>
      </div>

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={(updated) => setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)))}
          onDeleted={(taskId) => { setTasks((prev) => prev.filter((t) => t._id !== taskId)); setSelectedTaskId(null) }}
        />
      )}
    </Layout>
  )
}

export default Calendar
