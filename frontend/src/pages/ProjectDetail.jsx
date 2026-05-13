import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import KanbanBoard from '../components/KanbanBoard'
import CreateTaskModal from '../components/modals/CreateTaskModal'
import TaskDetailModal from '../components/modals/TaskDetailModal'
import { useSocket } from '../context/SocketContext'

const ProjectDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [stats, setStats] = useState({})
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [view, setView] = useState('kanban') // 'kanban' | 'list'
  const { joinProject, leaveProject, on, off } = useSocket() || {}

  const fetchData = useCallback(async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/tasks?projectId=${id}`),
      ])
      setProject(projRes.data.data.project)
      setStats(projRes.data.data.stats)
      setTasks(taskRes.data.data.tasks)
    } catch (err) {
      if (err.response?.status === 404) navigate('/projects')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    fetchData()
    joinProject?.(id)
    return () => leaveProject?.(id)
  }, [id, fetchData, joinProject, leaveProject])

  // Real-time task events
  useEffect(() => {
    const onCreate = ({ task }) => {
      if (task.projectId === id || task.projectId?._id === id) {
        setTasks((prev) => [task, ...prev])
      }
    }
    const onStatusChange = ({ taskId, status, task }) => {
      setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status } : t)))
    }
    const onUpdate = ({ task }) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)))
    }
    const onDelete = ({ taskId }) => {
      setTasks((prev) => prev.filter((t) => t._id !== taskId))
    }

    on?.('task:created', onCreate)
    on?.('task:status_changed', onStatusChange)
    on?.('task:updated', onUpdate)
    on?.('task:deleted', onDelete)

    return () => {
      off?.('task:created', onCreate)
      off?.('task:status_changed', onStatusChange)
      off?.('task:updated', onUpdate)
      off?.('task:deleted', onDelete)
    }
  }, [on, off, id])

  const handleStatusChange = (taskId, status) => {
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status } : t)))
  }

  const handleDelete = (taskId) => {
    setTasks((prev) => prev.filter((t) => t._id !== taskId))
  }

  const handleCreated = (task) => {
    setTasks((prev) => [task, ...prev])
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === 'DONE').length
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1"
        >
          ← Projects
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-3 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: project?.color || '#6366f1' }} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project?.title}</h1>
              {project?.description && <p className="text-gray-400 text-sm mt-0.5">{project.description}</p>}
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <span className="text-lg leading-none">+</span> Add Task
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-4 text-sm text-gray-500">
          <span>{totalTasks} tasks</span>
          <span>{doneTasks} completed</span>
          <span>{tasks.filter((t) => t.status === 'IN_PROGRESS').length} in progress</span>
          {totalTasks > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600">{progress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setView('kanban')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === 'kanban' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => setView('list')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === 'list' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          List
        </button>
      </div>

      {/* Board / List */}
      {view === 'kanban' ? (
        <KanbanBoard tasks={tasks} onStatusChange={handleStatusChange} onDelete={handleDelete} onTaskClick={setSelectedTaskId} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No tasks yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Task', 'Status', 'Priority', 'Assignee', 'Due Date'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map((task) => (
                  <tr key={task._id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedTaskId(task._id)}>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                      <div className="truncate hover:text-brand-700">{task.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        task.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                        task.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                        task.priority === 'MEDIUM' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.assigneeId ? (task.assigneeId.name || task.assigneeId.phone) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <CreateTaskModal projectId={id} onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

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

export default ProjectDetail
