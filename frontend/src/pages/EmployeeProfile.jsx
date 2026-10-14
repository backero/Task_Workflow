import { useState, useEffect, useRef } from 'react'
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

const ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']

const StatPill = ({ label, value, color }) => (
  <div className="text-center">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
  </div>
)

const EditModal = ({ employee, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name:        employee.name        || '',
    email:       employee.email       || '',
    role:        employee.role        || 'EMPLOYEE',
    department:  employee.department  || '',
    designation: employee.designation || '',
    joiningDate: employee.joiningDate ? employee.joiningDate.split('T')[0] : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = { ...form }
      if (!payload.joiningDate) delete payload.joiningDate
      if (!payload.email)       payload.email = null
      if (!payload.department)  payload.department = null
      if (!payload.designation) payload.designation = null
      const res = await api.patch(`/employees/${employee._id}`, payload)
      onSaved(res.data.data.employee)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Edit Employee</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input
                className="input-field text-sm py-2.5"
                placeholder="e.g. Rahul Sharma"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phone <span className="text-gray-400 font-normal">(read only)</span>
              </label>
              <input
                className="input-field text-sm py-2.5 bg-gray-50 text-gray-400"
                value={employee.phone}
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                className="input-field text-sm py-2.5"
                placeholder="rahul@company.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                className="input-field text-sm py-2.5"
                value={form.role}
                onChange={e => set('role', e.target.value)}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
              <input
                className="input-field text-sm py-2.5"
                placeholder="e.g. Engineering"
                value={form.department}
                onChange={e => set('department', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Title / Designation</label>
              <input
                className="input-field text-sm py-2.5"
                placeholder="e.g. Senior Developer"
                value={form.designation}
                onChange={e => set('designation', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date</label>
            <input
              type="date"
              className="input-field text-sm py-2.5"
              value={form.joiningDate}
              onChange={e => set('joiningDate', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EmployeeProfile() {
  const { id } = useParams()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [editOpen, setEditOpen]   = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)

  const fetchData = () => {
    setLoading(true)
    api.get(`/employees/${id}`)
      .then(res => setData(res.data.data))
      .catch(() => setError('Employee not found or you do not have access.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [id])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await api.patch(`/employees/${id}/avatar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setData(prev => ({ ...prev, employee: res.data.data.employee }))
    } catch (err) {
      alert(err.response?.data?.message || 'Avatar upload failed')
    } finally {
      setAvatarLoading(false)
      e.target.value = ''
    }
  }

  const handleSaved = (updatedEmployee) => {
    setData(prev => ({ ...prev, employee: updatedEmployee }))
  }

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
  const canEditThis = canWrite && employee._id !== currentUser?._id

  const avatarLetter = (employee.name?.[0] || employee.phone?.[3] || '?').toUpperCase()

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
            {/* Avatar with upload */}
            <div className="relative flex-shrink-0">
              {employee.avatar ? (
                <img
                  src={employee.avatar}
                  alt={employee.name}
                  className="w-20 h-20 rounded-2xl object-cover"
                />
              ) : (
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold ${employee.isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                  {avatarLetter}
                </div>
              )}
              {canEditThis && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarLoading}
                    className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity disabled:opacity-60"
                    title="Change photo"
                  >
                    {avatarLoading ? (
                      <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </>
              )}
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
            {canEditThis && (
              <button
                onClick={() => setEditOpen(true)}
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

      {editOpen && (
        <EditModal
          employee={employee}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  )
}
