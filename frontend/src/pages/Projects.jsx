import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Layout from '../components/Layout'
import CreateProjectModal from '../components/modals/CreateProjectModal'
import { useSocket } from '../context/SocketContext'

const STATUS_BADGE = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  ARCHIVED:  'bg-gray-100 text-gray-500',
}

const Projects = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const { on, off } = useSocket() || {}

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects')
      setProjects(data.data.projects)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    const handler = ({ project }) => setProjects((prev) => [project, ...prev])
    on?.('project:created', handler)
    return () => off?.('project:created', handler)
  }, [on, off])

  const handleCreated = (project) => {
    setProjects((prev) => [project, ...prev])
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> New Project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="text-5xl mb-4">📁</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No projects yet</h3>
          <p className="text-gray-400 text-sm mb-6">Create your first project to start managing tasks</p>
          <button onClick={() => setShowCreate(true)} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors">
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p._id}
              onClick={() => navigate(`/projects/${p._id}`)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all group overflow-hidden"
            >
              {/* Color bar */}
              <div className="h-1.5" style={{ backgroundColor: p.color || '#6366f1' }} />

              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-800 group-hover:text-brand-700 transition-colors line-clamp-1">
                    {p.title}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[p.status]}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>

                {p.description && (
                  <p className="text-sm text-gray-400 line-clamp-2 mb-4">{p.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                  <span>{p.taskCount ?? 0} tasks · {p.completedTaskCount ?? 0} done</span>
                  {p.dueDate && (
                    <span>{new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  )}
                </div>

                {/* Progress bar */}
                {p.taskCount > 0 && (
                  <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${Math.round((p.completedTaskCount / p.taskCount) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </Layout>
  )
}

export default Projects
