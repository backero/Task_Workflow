import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';
import clsx from 'clsx';
import { useAuthStore } from '../../store/useAuthStore';
import { useWorkflowStore } from '../../store/useWorkflowStore';

const MANAGER_ROLES = ['super_admin', 'chairman', 'founder', 'admin', 'manager', 'team_lead'];

export default function WorkflowToolbar({ rootTaskId, onAddSubtask, onSaveTemplate, onApplyTemplate }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { user } = useAuthStore();
  const { templates, fetchTemplates } = useWorkflowStore();
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  const isManager = MANAGER_ROLES.includes(user?.role);

  const handleShowTemplates = async () => {
    await fetchTemplates();
    setShowTemplateMenu(v => !v);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white dark:bg-[#0f1a2e] border border-gray-200 dark:border-[#1b2e4a] rounded-xl shadow-lg px-3 py-2">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
        <button
          onClick={() => zoomOut()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={() => fitView({ padding: 0.2 })}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Fit view"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          onClick={() => zoomIn()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[11px] text-gray-500 border-r border-gray-200 pr-3">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-slate-500" />
          Hierarchy
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-amber-500 border-dashed border-t-2 border-amber-500" />
          Dependency
        </span>
      </div>

      {/* Manager actions */}
      {isManager && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddSubtask(rootTaskId)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Subtask
          </button>

          {/* Template menu */}
          <div className="relative">
            <button
              onClick={handleShowTemplates}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Templates
            </button>

            {showTemplateMenu && (
              <div className="absolute top-full mt-2 right-0 w-64 bg-white dark:bg-[#17263d] border border-gray-200 dark:border-[#1b2e4a] rounded-xl shadow-xl z-50">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 px-2 py-1">Workflow Templates</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No templates yet</p>
                  ) : (
                    templates.map(t => (
                      <button
                        key={t._id}
                        onClick={() => { onApplyTemplate(t._id); setShowTemplateMenu(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <p className="text-xs font-medium text-gray-800">{t.name}</p>
                        <p className="text-[10px] text-gray-500">{t.nodes?.length || 0} tasks · used {t.usageCount}×</p>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={() => { onSaveTemplate(); setShowTemplateMenu(false); }}
                    className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium py-1 text-center"
                  >
                    + Save current workflow as template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
