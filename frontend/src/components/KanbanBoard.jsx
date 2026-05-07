import TaskCard from './TaskCard'

const COLUMNS = [
  { key: 'TODO',        label: 'To Do',       color: 'bg-gray-100',   dot: 'bg-gray-400'   },
  { key: 'IN_PROGRESS', label: 'In Progress',  color: 'bg-blue-50',    dot: 'bg-blue-500'   },
  { key: 'IN_REVIEW',   label: 'In Review',    color: 'bg-amber-50',   dot: 'bg-amber-500'  },
  { key: 'DONE',        label: 'Done',         color: 'bg-green-50',   dot: 'bg-green-500'  },
]

const KanbanBoard = ({ tasks, onStatusChange, onDelete, onTaskClick }) => {
  const byStatus = COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter((t) => t.status === col.key)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = byStatus[col.key] || []
        return (
          <div key={col.key} className={`${col.color} rounded-2xl p-3 min-h-[300px]`}>
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5">
                {colTasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="space-y-2.5">
              {colTasks.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  No tasks
                </div>
              ) : (
                colTasks.map((task) => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    onStatusChange={onStatusChange}
                    onDelete={onDelete}
                    onClick={onTaskClick}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default KanbanBoard
