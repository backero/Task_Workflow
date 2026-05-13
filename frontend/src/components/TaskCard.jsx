import api from '../api/axios'

const PRIORITY_BADGE = {
  LOW:    'bg-green-100 text-green-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH:   'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

const STATUS_NEXT = {
  TODO:        'IN_PROGRESS',
  IN_PROGRESS: 'IN_REVIEW',
  IN_REVIEW:   'DONE',
  DONE:        'TODO',
}

const STATUS_LABEL = {
  TODO:        '→ Start',
  IN_PROGRESS: '→ Review',
  IN_REVIEW:   '→ Done',
  DONE:        '↺ Reopen',
}

const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date()

const TaskCard = ({ task, onStatusChange, onDelete, onClick }) => {
  const advance = async (e) => {
    e.stopPropagation()
    const nextStatus = STATUS_NEXT[task.status]
    try {
      await api.patch(`/tasks/${task._id}/status`, { status: nextStatus })
      onStatusChange?.(task._id, nextStatus)
    } catch (err) {
      console.error('Status update failed', err)
    }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm('Delete this task?')) return
    try {
      await api.delete(`/tasks/${task._id}`)
      onDelete?.(task._id)
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE'

  return (
    <div
      onClick={() => onClick?.(task._id)}
      className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-gray-800 leading-snug flex-1">{task.title}</h4>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-lg leading-none flex-shrink-0"
          title="Delete task"
          tabIndex={-1}
        >
          ×
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{task.description}</p>
      )}

      {/* Tags */}
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority]}`}>
            {task.priority}
          </span>
          {task.dueDate && (
            <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {overdue ? '⚠ ' : ''}
              {new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {task.assigneeId && (
            <div
              className="w-6 h-6 bg-brand-200 text-brand-800 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0"
              title={task.assigneeId.name || task.assigneeId.phone}
            >
              {(task.assigneeId.name?.[0] || '?').toUpperCase()}
            </div>
          )}
          <button
            onClick={advance}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap"
            tabIndex={-1}
          >
            {STATUS_LABEL[task.status]}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskCard
