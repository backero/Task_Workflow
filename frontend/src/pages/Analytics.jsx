import { useState, useEffect } from 'react'
import api from '../api/axios'
import Layout from '../components/Layout'

// Pure CSS horizontal bar
const Bar = ({ value, max, color = 'bg-brand-500', height = 'h-2.5' }) => (
  <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${height}`}>
    <div
      className={`${color} ${height} rounded-full transition-all duration-700`}
      style={{ width: max > 0 ? `${Math.round((value / max) * 100)}%` : '0%' }}
    />
  </div>
)

const StatChip = ({ label, value, color }) => (
  <div className={`${color} rounded-xl p-4`}>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
  </div>
)

const ACTIVITY_LABEL = {
  USER_LOGIN:           '🔐 logged in',
  USER_REGISTERED:      '🎉 registered',
  ORG_CREATED:          '🏢 created the org',
  TASK_CREATED:         '📋 created a task',
  TASK_UPDATED:         '✏️ updated a task',
  TASK_STATUS_CHANGED:  '🔄 moved a task',
  PROFILE_UPDATED:      '👤 updated profile',
  MEMBER_INVITED:       '👥 invited a member',
  PROJECT_CREATED:      '📁 created a project',
}

const Analytics = () => {
  const [overview, setOverview] = useState(null)
  const [taskStats, setTaskStats] = useState(null)
  const [projectStats, setProjectStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/tasks'),
      api.get('/analytics/projects'),
      api.get('/analytics/activity?limit=20'),
    ]).then(([ovRes, taskRes, projRes, actRes]) => {
      setOverview(ovRes.data.data)
      setTaskStats(taskRes.data.data)
      setProjectStats(projRes.data.data)
      setActivity(actRes.data.data.logs)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  const t = overview?.tasks || {}
  const maxAssignee = Math.max(...(taskStats?.byAssignee?.map((a) => a.total) || [1]))

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-0.5">Organization performance overview</p>
      </div>

      {/* Overview chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatChip label="Total Tasks"     value={t.total ?? 0}           color="bg-indigo-50 text-indigo-700" />
        <StatChip label="Completed"       value={t.done ?? 0}            color="bg-green-50 text-green-700"  />
        <StatChip label="In Progress"     value={t.inProgress ?? 0}      color="bg-blue-50 text-blue-700"    />
        <StatChip label="Overdue"         value={t.overdue ?? 0}         color={t.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'} />
      </div>

      {/* Completion rate */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Overall Completion Rate</h3>
          <span className="text-2xl font-bold text-brand-600">{t.completionRate ?? 0}%</span>
        </div>
        <Bar value={t.completionRate ?? 0} max={100} color="bg-brand-500" height="h-3" />
        <div className="flex gap-4 mt-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-200 rounded-full" /> To Do: {t.todo ?? 0}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full" /> In Progress: {t.inProgress ?? 0}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" /> In Review: {t.inReview ?? 0}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" /> Done: {t.done ?? 0}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Priority distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Task Priority Distribution</h3>
          {taskStats?.byPriority && (
            <div className="space-y-3">
              {[
                { key: 'URGENT', label: 'Urgent', color: 'bg-red-500',    textColor: 'text-red-600'    },
                { key: 'HIGH',   label: 'High',   color: 'bg-orange-400', textColor: 'text-orange-600' },
                { key: 'MEDIUM', label: 'Medium', color: 'bg-blue-500',   textColor: 'text-blue-600'   },
                { key: 'LOW',    label: 'Low',    color: 'bg-green-400',  textColor: 'text-green-600'  },
              ].map(({ key, label, color, textColor }) => {
                const count = taskStats.byPriority[key] || 0
                const total = Object.values(taskStats.byPriority).reduce((a, b) => a + b, 0)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${textColor}`}>{label}</span>
                      <span className="text-sm text-gray-500">{count} <span className="text-xs text-gray-400">({total > 0 ? Math.round((count / total) * 100) : 0}%)</span></span>
                    </div>
                    <Bar value={count} max={Math.max(total, 1)} color={color} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Org stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Organization Stats</h3>
          <div className="space-y-4">
            {[
              { label: 'Total Members',      value: overview?.members ?? 0,                icon: '👥' },
              { label: 'Active Projects',    value: overview?.projects?.active ?? 0,       icon: '📁' },
              { label: 'Completed Projects', value: overview?.projects?.completed ?? 0,    icon: '✅' },
              { label: 'Overdue Tasks',      value: t.overdue ?? 0,                        icon: '⚠️' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{icon}</span>
                  <span>{label}</span>
                </div>
                <span className="text-lg font-bold text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project progress */}
      {projectStats?.projects?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">Project Progress</h3>
          <div className="space-y-4">
            {projectStats.projects.map((p) => (
              <div key={p._id}>
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{p.title}</span>
                  <span className="text-sm font-bold text-gray-800">{p.progress}%</span>
                  <span className="text-xs text-gray-400">{p.completedTaskCount}/{p.taskCount} tasks</span>
                </div>
                <Bar value={p.progress} max={100} color="bg-green-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team workload */}
      {taskStats?.byAssignee?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">Team Workload</h3>
          <div className="space-y-3">
            {taskStats.byAssignee.map((a) => (
              <div key={a._id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-brand-100 text-brand-700 rounded-full text-xs flex items-center justify-center font-bold">
                      {(a.name?.[0] || '?').toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{a.name || a.phone}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {a.total} tasks · <span className="text-green-600">{a.done} done</span>
                  </div>
                </div>
                <Bar value={a.total} max={maxAssignee || 1} color="bg-brand-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue tasks */}
      {taskStats?.overdueTasks?.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 mb-6">
          <h3 className="font-semibold text-red-700 mb-3">⚠ Overdue Tasks ({taskStats.overdueTasks.length})</h3>
          <div className="space-y-2">
            {taskStats.overdueTasks.map((t) => (
              <div key={t._id} className="flex items-center justify-between text-sm">
                <span className="text-red-700 font-medium truncate flex-1">{t.title}</span>
                <span className="text-red-400 text-xs ml-4 flex-shrink-0">
                  Due {new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      {activity.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Recent Activity</h3>
          <div className="space-y-2">
            {activity.map((log) => (
              <div key={log._id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 bg-brand-50 text-brand-700 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                  {(log.userId?.name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700">
                    <strong>{log.userId?.name || log.userId?.phone || 'Someone'}</strong>{' '}
                    {ACTIVITY_LABEL[log.action] || log.action.toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}

export default Analytics
