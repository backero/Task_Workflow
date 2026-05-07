import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import ImportModal from '../components/ImportModal'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']

const ROLE_COLOR = {
  ORG_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:     'bg-brand-100 text-brand-700',
  HR:        'bg-pink-100 text-pink-700',
  MANAGER:   'bg-amber-100 text-amber-700',
  EMPLOYEE:  'bg-green-100 text-green-700',
}

const EMPTY_FORM = {
  name: '', phone: '', email: '', role: 'EMPLOYEE',
  department: '', designation: '', joiningDate: '',
}

/* ─── Employee Modal ─────────────────────────────────────────────────────────── */

const EmployeeModal = ({ mode, initial, departments, onClose, onSave }) => {
  const [form, setForm]     = useState(initial || EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

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
      await onSave(payload)
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'add' ? 'Add Employee' : 'Edit Employee'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Form */}
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
                Phone * {mode === 'edit' && <span className="text-gray-400 font-normal">(read only)</span>}
              </label>
              <input
                className="input-field text-sm py-2.5 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="+919876543210"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                disabled={mode === 'edit'}
                required={mode === 'add'}
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
                value={form.email || ''}
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
                list="dept-list"
                placeholder="e.g. Engineering"
                value={form.department || ''}
                onChange={e => set('department', e.target.value)}
              />
              <datalist id="dept-list">
                {departments.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Title / Designation</label>
              <input
                className="input-field text-sm py-2.5"
                placeholder="e.g. Senior Developer"
                value={form.designation || ''}
                onChange={e => set('designation', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date</label>
            <input
              type="date"
              className="input-field text-sm py-2.5"
              value={form.joiningDate ? form.joiningDate.split('T')[0] : ''}
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
              {loading ? 'Saving…' : (mode === 'add' ? 'Add Employee' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Employees Page ─────────────────────────────────────────────────────────── */

export default function Employees() {
  const { user } = useAuth()
  const { socket } = useSocket() || {}
  const navigate = useNavigate()

  const canWrite  = ['HR', 'ADMIN', 'ORG_ADMIN'].includes(user?.role)
  const canDelete = ['ADMIN', 'ORG_ADMIN'].includes(user?.role)

  const [employees, setEmployees]     = useState([])
  const [total, setTotal]             = useState(0)
  const [pages, setPages]             = useState(1)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [departments, setDepartments] = useState([])

  const [search,     setSearch]     = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatus]   = useState('')

  const [modal, setModal]         = useState(null)  // null | { mode: 'add'|'edit', employee?: obj }
  const [showImport, setShowImport] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)  // employeeId being acted on

  const fetchEmployees = useCallback(async (pg = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: pg, limit: 15 })
      if (search)      params.set('search',     search)
      if (deptFilter)  params.set('department',  deptFilter)
      if (roleFilter)  params.set('role',        roleFilter)
      if (statusFilter) params.set('status',     statusFilter)
      const res = await api.get(`/employees?${params}`)
      const d = res.data.data
      setEmployees(d.employees)
      setTotal(d.total)
      setPages(d.pages)
    } catch {}
    finally { setLoading(false) }
  }, [page, search, deptFilter, roleFilter, statusFilter])

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get('/employees/departments')
      setDepartments(res.data.data.departments || [])
    } catch {}
  }, [])

  useEffect(() => { fetchEmployees(page) }, [page])
  useEffect(() => { setPage(1); fetchEmployees(1) }, [search, deptFilter, roleFilter, statusFilter])
  useEffect(() => { fetchDepartments() }, [])

  // Real-time
  useEffect(() => {
    if (!socket) return
    const refresh = () => { fetchEmployees(page); fetchDepartments() }
    socket.on('employee:created',        refresh)
    socket.on('employee:updated',        refresh)
    socket.on('employee:deleted',        refresh)
    socket.on('employee:status_changed', refresh)
    return () => {
      socket.off('employee:created',        refresh)
      socket.off('employee:updated',        refresh)
      socket.off('employee:deleted',        refresh)
      socket.off('employee:status_changed', refresh)
    }
  }, [socket, fetchEmployees, fetchDepartments, page])

  const handleAdd = async (payload) => {
    await api.post('/employees', payload)
    fetchDepartments()
  }

  const handleEdit = async (payload) => {
    const { phone: _p, ...rest } = payload
    await api.patch(`/employees/${modal.employee._id}`, rest)
    fetchDepartments()
  }

  const handleToggleStatus = async (emp) => {
    setActionLoading(emp._id)
    try {
      await api.patch(`/employees/${emp._id}/status`)
      fetchEmployees(page)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status')
    } finally { setActionLoading(null) }
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(`Remove ${emp.name || emp.phone} from the organisation? They will lose access immediately.`)) return
    setActionLoading(emp._id)
    try {
      await api.delete(`/employees/${emp._id}`)
      fetchEmployees(page)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove employee')
    } finally { setActionLoading(null) }
  }

  const activeCount   = employees.filter(e => e.isActive).length
  const inactiveCount = employees.filter(e => !e.isActive).length

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {total} total&nbsp;·&nbsp;
            <span className="text-green-600">{activeCount} active</span>&nbsp;·&nbsp;
            <span className="text-gray-400">{inactiveCount} inactive</span>
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Import
            </button>
            <button
              onClick={() => setModal({ mode: 'add' })}
              className="bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Add Employee
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            className="input-field text-sm py-2.5"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-field text-sm py-2.5"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            className="input-field text-sm py-2.5"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {['ORG_ADMIN', ...ROLES].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            className="input-field text-sm py-2.5"
            value={statusFilter}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-[2fr_1.5fr_1.2fr_1.2fr_1.2fr_auto] gap-4 px-6 py-3 border-b border-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span>Employee</span>
          <span>Contact</span>
          <span>Role</span>
          <span>Department</span>
          <span>Joined</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-4 animate-pulse flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-32" />
                  <div className="h-2.5 bg-gray-100 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">👥</div>
            <p className="text-gray-500 font-medium">No employees found</p>
            <p className="text-sm text-gray-400 mt-1">
              {search || deptFilter || roleFilter || statusFilter
                ? 'Try clearing the filters'
                : canWrite ? 'Click "Add Employee" to get started' : 'No employees in your organization yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {employees.map(emp => (
              <div
                key={emp._id}
                className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1.2fr_1.2fr_1.2fr_auto] gap-2 md:gap-4 px-4 md:px-6 py-4 hover:bg-gray-50/50 transition-colors items-center"
              >
                {/* Employee info */}
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => navigate(`/employees/${emp._id}`)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${emp.isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                    {(emp.name?.[0] || emp.phone?.[3] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate hover:text-brand-600">
                      {emp.name || <span className="text-gray-400 italic">No name</span>}
                    </p>
                    {emp.designation && (
                      <p className="text-xs text-gray-400 truncate">{emp.designation}</p>
                    )}
                    <span className={`md:hidden inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${emp.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {emp.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 truncate">{emp.phone}</p>
                  {emp.email && <p className="text-xs text-gray-400 truncate">{emp.email}</p>}
                </div>

                {/* Role */}
                <div>
                  <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[emp.role] || 'bg-gray-100 text-gray-600'}`}>
                    {emp.role}
                  </span>
                </div>

                {/* Department */}
                <div>
                  <span className="text-sm text-gray-600">{emp.department || <span className="text-gray-300">—</span>}</span>
                </div>

                {/* Joined */}
                <div>
                  <span className="text-sm text-gray-500">
                    {emp.joiningDate
                      ? new Date(emp.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : new Date(emp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    }
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/employees/${emp._id}`)}
                    className="text-xs text-gray-400 hover:text-brand-600 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
                    title="View profile"
                  >
                    View
                  </button>
                  {canWrite && emp._id !== user?._id && (
                    <button
                      onClick={() => setModal({
                        mode: 'edit',
                        employee: emp,
                        initial: {
                          name: emp.name || '', phone: emp.phone, email: emp.email || '',
                          role: emp.role, department: emp.department || '',
                          designation: emp.designation || '',
                          joiningDate: emp.joiningDate ? emp.joiningDate.split('T')[0] : '',
                        },
                      })}
                      className="text-xs text-gray-400 hover:text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                  )}
                  {canWrite && emp._id !== user?._id && (
                    <button
                      onClick={() => handleToggleStatus(emp)}
                      disabled={actionLoading === emp._id}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50 ${emp.isActive ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-green-500 hover:text-green-700 hover:bg-green-50'}`}
                      title={emp.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {emp.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  {canDelete && emp._id !== user?._id && (
                    <button
                      onClick={() => handleDelete(emp)}
                      disabled={actionLoading === emp._id}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-400">
            Showing {((page - 1) * 15) + 1}–{Math.min(page * 15, total)} of {total} employees
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <div className="flex gap-1">
              {[...Array(Math.min(pages, 7))].map((_, i) => {
                const pg = i + 1
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`w-8 h-8 text-sm rounded-lg transition-colors ${pg === page ? 'bg-brand-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    {pg}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <EmployeeModal
          mode={modal.mode}
          initial={modal.initial}
          departments={departments}
          onClose={() => setModal(null)}
          onSave={modal.mode === 'add' ? handleAdd : handleEdit}
        />
      )}

      {showImport && (
        <ImportModal
          type="employees"
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); fetchEmployees() }}
        />
      )}
    </Layout>
  )
}
