import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import Layout from '../components/Layout'
import api    from '../api/axios'

// ─── Palette ──────────────────────────────────────────────────────────────────
const STATUS_COLORS  = { TODO: '#6366f1', IN_PROGRESS: '#f59e0b', IN_REVIEW: '#8b5cf6', DONE: '#10b981' }
const PRIORITY_COLORS = { LOW: '#6b7280', MEDIUM: '#3b82f6', HIGH: '#f97316', URGENT: '#ef4444' }
const PIE_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#3b82f6']

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    gray:   'bg-gray-50 text-gray-700 border-gray-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

function ExportButtons({ type, query }) {
  const [loadingPDF, setLoadingPDF]   = useState(false)
  const [loadingXLS, setLoadingXLS]   = useState(false)

  const download = async (format) => {
    const setter = format === 'pdf' ? setLoadingPDF : setLoadingXLS
    setter(true)
    try {
      const params = new URLSearchParams(query).toString()
      const resp = await api.get(`/reports/export/${type}/${format}?${params}`, { responseType: 'blob' })
      const ext  = format === 'pdf' ? 'pdf' : 'xlsx'
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const url  = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${type}-report.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    setter(false)
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => download('pdf')}
        disabled={loadingPDF}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
      >
        {loadingPDF ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>
        )}
        PDF
      </button>
      <button
        onClick={() => download('excel')}
        disabled={loadingXLS}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition disabled:opacity-50"
      >
        {loadingXLS ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>
        )}
        Excel
      </button>
    </div>
  )
}

function FilterBar({ filters, onChange, extraFilters }) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-gray-500 mb-1">From</label>
        <input type="date" value={filters.from || ''} onChange={e => onChange('from', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">To</label>
        <input type="date" value={filters.to || ''} onChange={e => onChange('to', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
      </div>
      {extraFilters}
      <button onClick={() => onChange('_reset')}
        className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg transition">
        Clear
      </button>
    </div>
  )
}

// ─── Task Report Tab ──────────────────────────────────────────────────────────
function TaskReport() {
  const [filters, setFilters]  = useState({})
  const [data,    setData]     = useState(null)
  const [loading, setLoading]  = useState(false)
  const [page,    setPage]     = useState(1)
  const PER_PAGE = 20

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v))
      const res = await api.get('/reports/tasks', { params })
      setData(res.data.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [filters])

  useEffect(() => { fetch() }, [fetch])

  const handleFilter = (key, val) => {
    if (key === '_reset') { setFilters({}); return }
    setFilters(p => ({ ...p, [key]: val }))
    setPage(1)
  }

  const statusChartData = data ? Object.entries(data.summary.byStatus).map(([k, v]) => ({ name: k.replace('_', ' '), value: v })) : []
  const priorityChartData = data ? Object.entries(data.summary.byPriority).map(([k, v]) => ({ name: k, value: v })) : []
  const tasks = data?.tasks || []
  const pageTasks = tasks.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(tasks.length / PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar filters={filters} onChange={handleFilter} extraFilters={
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={filters.status || ''} onChange={e => handleFilter('status', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                <option value="">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select value={filters.priority || ''} onChange={e => handleFilter('priority', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </>
        } />
        <ExportButtons type="tasks" query={Object.fromEntries(Object.entries(filters).filter(([,v]) => v))} />
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading report…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Tasks"      value={data.summary.total}           color="indigo" />
            <StatCard label="Completed"        value={data.summary.completed}       color="green"  />
            <StatCard label="Overdue"          value={data.summary.overdue}         color="red"    />
            <StatCard label="Completion Rate"  value={`${data.summary.completionRate}%`} color={data.summary.completionRate >= 60 ? 'green' : 'amber'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasks by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Tasks" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name.replace(' ', '_')] || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasks by Priority</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={priorityChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {priorityChartData.map((entry) => (
                      <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Task List ({tasks.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Title','Status','Priority','Project','Assignee','Due Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageTasks.map(t => (
                    <tr key={t._id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === 'DONE' ? 'bg-green-100 text-green-700' :
                          t.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
                          t.status === 'IN_REVIEW' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'}`}>{t.status?.replace('_',' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                          t.priority === 'HIGH'   ? 'bg-orange-100 text-orange-700' :
                          t.priority === 'MEDIUM' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{t.projectId?.title || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{t.assigneeId?.name || t.assigneeId?.phone || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN') : '-'}
                      </td>
                    </tr>
                  ))}
                  {pageTasks.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No tasks found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Employee Report Tab ──────────────────────────────────────────────────────
function EmployeeReport() {
  const [filters, setFilters] = useState({})
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v))
      const res = await api.get('/reports/employees', { params })
      setData(res.data.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [filters])

  useEffect(() => { fetch() }, [fetch])

  const handleFilter = (key, val) => {
    if (key === '_reset') { setFilters({}); return }
    setFilters(p => ({ ...p, [key]: val }))
  }

  const chartData = (data?.data || [])
    .filter(e => e.taskStats.total > 0)
    .slice(0, 12)
    .map(e => ({ name: (e.name || e.phone || '').split(' ')[0], rate: e.taskStats.completionRate, tasks: e.taskStats.total }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar filters={filters} onChange={handleFilter} extraFilters={
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <input type="text" placeholder="Any department" value={filters.department || ''}
                onChange={e => handleFilter('department', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none w-36" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select value={filters.role || ''} onChange={e => handleFilter('role', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                <option value="">All Roles</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="HR">HR</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </>
        } />
        <ExportButtons type="employees" query={Object.fromEntries(Object.entries(filters).filter(([,v]) => v))} />
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading report…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Total Employees"    value={data.summary.total}                    color="indigo" />
            <StatCard label="Active"             value={data.summary.active}                   color="green"  />
            <StatCard label="Avg Completion Rate" value={`${data.summary.avgCompletionRate}%`} color={data.summary.avgCompletionRate >= 60 ? 'green' : 'amber'} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Completion Rate by Employee</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v, n) => [n === 'rate' ? `${v}%` : v, n === 'rate' ? 'Completion' : 'Tasks']} />
                <Legend />
                <Bar dataKey="rate"  name="Completion %" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tasks" name="Total Tasks"  fill="#e0e7ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Employees ({data.data.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Employee','Department','Role','Status','Tasks','Done','Overdue','Rate'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(data.data || []).map(e => (
                    <tr key={e._id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                            {(e.name || e.phone || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{e.name || e.phone}</p>
                            {e.email && <p className="text-xs text-gray-400">{e.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{e.department || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{e.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${e.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {e.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{e.taskStats.total}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{e.taskStats.completed}</td>
                      <td className="px-4 py-3 text-red-500">{e.taskStats.overdue}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-16">
                            <div className={`h-1.5 rounded-full ${e.taskStats.completionRate >= 70 ? 'bg-green-500' : e.taskStats.completionRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${e.taskStats.completionRate}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-8">{e.taskStats.completionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.data.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No employees found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Inventory Report Tab ─────────────────────────────────────────────────────
function InventoryReport() {
  const [filters, setFilters] = useState({})
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [view,    setView]    = useState('products')

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v))
      const res = await api.get('/reports/inventory', { params })
      setData(res.data.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [filters])

  useEffect(() => { fetch() }, [fetch])

  const handleFilter = (key, val) => {
    if (key === '_reset') { setFilters({}); return }
    setFilters(p => ({ ...p, [key]: val }))
  }

  const stockChartData = (data?.products || [])
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12)
    .map(p => ({ name: p.name.slice(0, 10), stock: p.quantity, threshold: p.minStockThreshold }))

  const MOV_COLORS = { IN: '#10b981', OUT: '#ef4444', ADJUSTMENT: '#f59e0b' }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar filters={filters} onChange={handleFilter} extraFilters={
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input type="text" placeholder="Any category" value={filters.category || ''}
                onChange={e => handleFilter('category', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none w-36" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Movement Type</label>
              <select value={filters.movementType || ''} onChange={e => handleFilter('movementType', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                <option value="">All Types</option>
                <option value="IN">Stock In</option>
                <option value="OUT">Stock Out</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
          </>
        } />
        <ExportButtons type="inventory" query={Object.fromEntries(Object.entries(filters).filter(([,v]) => v))} />
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading report…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Total Products"  value={data.summary.totalProducts}                           color="indigo" />
            <StatCard label="Low Stock Items" value={data.summary.lowStockCount}                           color={data.summary.lowStockCount > 0 ? 'red' : 'green'} />
            <StatCard label="Total Stock Value" value={`₹${Math.round(data.summary.totalValue).toLocaleString('en-IN')}`} color="green" />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Stock Levels (Top 12)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stockChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="stock"     name="Current Stock"  fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="threshold" name="Min Threshold" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* View toggle */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <button onClick={() => setView('products')}
                className={`text-sm px-3 py-1 rounded-lg transition ${view === 'products' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Products ({data.products.length})
              </button>
              <button onClick={() => setView('movements')}
                className={`text-sm px-3 py-1 rounded-lg transition ${view === 'movements' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Movements ({data.movements.length})
              </button>
            </div>

            {view === 'products' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Product','SKU','Category','Stock','Min Threshold','Unit Price','Value','Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.products.map(p => {
                      const isLow = p.quantity <= p.minStockThreshold
                      return (
                        <tr key={p._id} className={`hover:bg-gray-50 transition ${isLow ? 'bg-red-50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                          <td className="px-4 py-3 text-gray-500">{p.category || '-'}</td>
                          <td className={`px-4 py-3 font-semibold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>{p.quantity}</td>
                          <td className="px-4 py-3 text-gray-500">{p.minStockThreshold}</td>
                          <td className="px-4 py-3 text-gray-700">₹{(p.unitPrice || 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-gray-700">₹{((p.quantity || 0) * (p.unitPrice || 0)).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {isLow ? 'Low Stock' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {data.products.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No products found</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'movements' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Date','Product','SKU','Type','Qty','Before','After','By','Note'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.movements.map(m => (
                      <tr key={m._id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{m.productId?.name || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.productId?.sku || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold`}
                            style={{ background: MOV_COLORS[m.type] + '20', color: MOV_COLORS[m.type] }}>
                            {m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-700">{m.quantity}</td>
                        <td className="px-4 py-3 text-gray-500">{m.quantityBefore}</td>
                        <td className="px-4 py-3 text-gray-500">{m.quantityAfter}</td>
                        <td className="px-4 py-3 text-gray-500">{m.performedBy?.name || m.performedBy?.phone || '-'}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{m.note || '-'}</td>
                      </tr>
                    ))}
                    {data.movements.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No movements found</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Finance Report Tab ───────────────────────────────────────────────────────
function FinanceReport() {
  const [filters, setFilters] = useState({})
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [page,    setPage]    = useState(1)
  const PER_PAGE = 20

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v))
      const res = await api.get('/reports/finance', { params })
      setData(res.data.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [filters])

  useEffect(() => { fetch() }, [fetch])

  const handleFilter = (key, val) => {
    if (key === '_reset') { setFilters({}); return }
    setFilters(p => ({ ...p, [key]: val }))
    setPage(1)
  }

  const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

  const trendData = (data?.trend || []).map(t => ({
    month: t.month.slice(5),
    Income: t.income,
    Expense: t.expense,
    Net: t.income - t.expense,
  }))

  const transactions  = data?.transactions || []
  const pageTx        = transactions.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages    = Math.ceil(transactions.length / PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterBar filters={filters} onChange={handleFilter} extraFilters={
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={filters.type || ''} onChange={e => handleFilter('type', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                <option value="">All Types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input type="text" placeholder="Any category" value={filters.category || ''}
                onChange={e => handleFilter('category', e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-400 focus:outline-none w-36" />
            </div>
          </>
        } />
        <ExportButtons type="finance" query={Object.fromEntries(Object.entries(filters).filter(([,v]) => v))} />
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading report…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Total Revenue"  value={fmt(data.summary.revenue)}   color="green" />
            <StatCard label="Total Expenses" value={fmt(data.summary.expenses)}  color="red"   />
            <StatCard label="Net Profit / Loss"
              value={fmt(Math.abs(data.summary.netProfit))}
              sub={data.summary.netProfit >= 0 ? 'Profit' : 'Loss'}
              color={data.summary.netProfit >= 0 ? 'green' : 'red'} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Revenue vs Expenses</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => `₹${Math.round(v).toLocaleString('en-IN')}`} />
                <Legend />
                <Bar dataKey="Income"  fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Transactions ({transactions.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{['Date','Description','Category','Type','Amount','Payment Method'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageTx.map(t => (
                    <tr key={t._id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(t.date).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{t.description}</td>
                      <td className="px-4 py-3 text-gray-500">{t.category || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${t.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-semibold ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'INCOME' ? '+' : '-'} ₹{(t.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{t.paymentMethod?.replace('_',' ') || '-'}</td>
                    </tr>
                  ))}
                  {pageTx.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions found</td></tr>}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Reports Page ────────────────────────────────────────────────────────
const TABS = [
  { id: 'tasks',     label: 'Tasks',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'employees', label: 'Employees', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'finance',   label: 'Finance',   icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
]

export default function Reports() {
  const [activeTab, setActiveTab] = useState('tasks')

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Generate and export reports for tasks, employees, inventory and finance</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'tasks'     && <TaskReport />}
          {activeTab === 'employees' && <EmployeeReport />}
          {activeTab === 'inventory' && <InventoryReport />}
          {activeTab === 'finance'   && <FinanceReport />}
        </div>
      </div>
    </Layout>
  )
}
