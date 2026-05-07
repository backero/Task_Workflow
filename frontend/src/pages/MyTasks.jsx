import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import TaskCard from '../components/TaskCard'
import TaskDetailModal from '../components/modals/TaskDetailModal'

const FILTERS = ['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']

const MyTasks = () => {
  const navigate = useNavigate()
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    api.get('/tasks/my')
      .then(({ data }) => setTasks(data.data.tasks))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter)

  const handleStatusChange = (taskId, status) => {
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status } : t)))
  }

  const handleDelete = (taskId) => {
    setTasks((prev) => prev.filter((t) => t._id !== taskId))
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-gray-500 text-sm mt-0.5">{tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned to you</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.replace('_', ' ')}
            {f !== 'ALL' && (
              <span className="ml-1.5 text-xs opacity-70">
                {tasks.filter((t) => t.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-gray-500 text-sm">
            {filter === 'ALL' ? 'No tasks assigned to you yet' : `No ${filter.replace('_', ' ').toLowerCase()} tasks`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((task) => (
            <div key={task._id}>
              {task.projectId && (
                <div
                  className="text-xs text-gray-400 mb-1.5 flex items-center gap-1 cursor-pointer hover:text-brand-600"
                  onClick={() => navigate(`/projects/${task.projectId._id || task.projectId}`)}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: task.projectId.color || '#6366f1' }}
                  />
                  {task.projectId.title || 'Project'}
                </div>
              )}
              <TaskCard task={task} onStatusChange={handleStatusChange} onDelete={handleDelete} onClick={setSelectedTaskId} />
            </div>
          ))}
        </div>
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

export default MyTasks
