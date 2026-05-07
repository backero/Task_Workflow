import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'

const ROLE_COLOR = {
  ORG_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:     'bg-brand-100 text-brand-700',
  HR:        'bg-pink-100 text-pink-700',
  MANAGER:   'bg-amber-100 text-amber-700',
  EMPLOYEE:  'bg-green-100 text-green-700',
}

const STATUS_COLOR = {
  TODO:        'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  IN_REVIEW:   'bg-amber-100 text-amber-700',
  DONE:        'bg-green-100 text-green-700',
}

const PRIORITY_COLOR = {
  LOW:    'text-gray-400',
  MEDIUM: 'text-blue-500',
  HIGH:   'text-amber-500',
  URGENT: 'text-red-500',
}

const StatPill = ({ label, value, color }) => (
  <div className="text-center">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
  </div>
)

export default function EmployeeProfile() {
  const { id } = useParams()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    api.get(`/employees/${id}`)
      .then(res => setData(res.data.data))
      .catch(() => setError('Employee not found or you do not have access.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto animate-pulse space-y-4 mt-4">
          <div className="h-8 bg-gray-100 rounded w-32" />
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-gray-100 rounded w-40" />
                <div className="h-4 bg-gray-100 rounded w-24" />
                <div className="h-4 bg-gray-100 rounded w-20" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto mt-12 text-center">
          <div className="text-5xl mb-3">❌</div>
          <p className="text-gray-600">{error}</p>
          <button onClick={() => navigate('/employees')} className="mt-4 text-brand-600 hover:underline text-sm">
            ← Back to Employees
          </button>
        </div>
      </Layout>
    )
  }

  const { employee, taskStats, recentTasks } = data
  const completionRate = taskStats.total > 0
    ? Math.round((taskStats.completed / taskStats.total) * 100)
    : 0

  const canWrite = ['HR', 'ADMIN', 'ORG_ADMIN'].includes(currentUser?.role)

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 transition-colors">
          ← Back to Employees
        </Link>

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold flex-shrink-0 ${employee.isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
              {(employee.name?.[0] || employee.phone?.[3] || '?').toUpperCase()}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900">{employee.name || <span className="italic text-gray-400">No name set</span>}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[employee.role] || 'bg-gray-100 text-gray-600'}`}>
                  {employee.role}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${employee.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {employee.isActive ? '● Active' : '○ Inactive'}
                </span>
              </div>
              {employee.designation && (
                <p className="text-sm text-gray-500">{employee.designation}</p>
              )}
              {employee.department && (
                <p className="text-sm text-gray-400">{employee.department}</p>
              )}
            </div>

            {/* Edit button */}
            {canWrite && employee._id !== currentUser?._id && (
              <button
                onClick={() => navigate('/employees')}
                className="flex-shrink-0 text-sm border border-gray-200 px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Edit Employee
              </button>
            )}
          </div>

          {/* Contact & Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-50">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phone</p>
              <p className="text-sm text-gray-700 mt-1">{employee.phone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email</p>
              <p className="text-sm text-gray-700 mt-1 truncate">{employee.email || <span className="text-gray-300">—</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Joining Date</p>
              <p className="text-sm text-gray-700 mt-1">
                {employee.joiningDate
                  ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : new Date(employee.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                }
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Last Login</p>
              <p className="text-sm text-gray-700 mt-1">
                {employee.lastLoginAt
                  ? new Date(employee.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Task statistics */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-4">Task Statistics</h2>

          {taskStats.total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No tasks assigned yet</p>
          ) : (
            <>
              {/* Progress bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Completion Rate</span>
                  <span className="font-semibold text-green-600">{completionRate}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 py-3 px-2 bg-gray-50 rounded-xl">
                <StatPill label="Total"       value={taskStats.total}      color="text-gray-700" />
                <StatPill label="To Do"       value={taskStats.todo}       color="text-indigo-600" />
                <StatPill label="In Progress" value={taskStats.inProgress} color="text-amber-600" />
                <StatPill label="In Review"   value={taskStats.inReview}   color="text-purple-600" />
                <StatPill label="Done"        value={taskStats.completed}  color="text-green-600" />
              </div>
            </>
          )}
        </div>

        {/* Recent tasks */}
        {recentTasks?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 text-sm mb-4">Recent Tasks</h2>
            <div className="space-y-2">
              {recentTasks.map(task => (
                <div
                  key={task._id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => task.projectId && navigate(`/projects/${task.projectId._id || task.projectId}`)}
                >
                  {task.projectId?.color && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.projectId.color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                    {task.projectId?.title && (
                      <p className="text-xs text-gray-400 truncate">{task.projectId.title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[task.status]}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
