import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import TaskNode from './TaskNode';
import DependencyEdge from './DependencyEdge';
import WorkflowToolbar from './WorkflowToolbar';
import TaskDetailPanel from './TaskDetailPanel';
import AddSubtaskModal from './AddSubtaskModal';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useAuthStore } from '../../store/useAuthStore';
import ConfirmDialog from '../common/ConfirmDialog';
import toast from 'react-hot-toast';

const MANAGER_ROLES = ['super_admin', 'chairman', 'founder', 'admin', 'manager', 'team_lead'];

const NODE_TYPES = { taskNode: TaskNode };
const EDGE_TYPES = { dependencyEdge: DependencyEdge };

const MINIMAP_COLORS = {
  'Completed':        '#22c55e',
  'In Progress':      '#eab308',
  'Pending':          '#94a3b8',
  'Assigned':         '#3b82f6',
  'Approval Pending': '#6366f1',
  'Changes Requested':'#f97316',
  'Reopened':         '#ef4444',
  'Cancelled':        '#6b7280',
  'Under Review':     '#a855f7',
};

function getMinimapColor(node) {
  return MINIMAP_COLORS[node.data?.status] || '#94a3b8';
}

function WorkflowCanvas({ rootTaskId }) {
  const {
    graph, fetchWorkflowGraph, isLoading, error,
    selectNode, selectedNode, showDetailPanel,
    addDependency, updateNodePositions, saveTemplate, applyTemplate, deleteTask,
  } = useWorkflowStore();
  const { user } = useAuthStore();

  const canDelete = MANAGER_ROLES.includes(user?.role);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [connectingSource, setConnectingSource] = useState(null);
  const [addSubtaskState, setAddSubtaskState] = useState(null); // { parentId, parentTitle }
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title }
  const moveTimer = useRef(null);

  // Fetch on mount / rootTaskId change
  useEffect(() => {
    if (rootTaskId) fetchWorkflowGraph(rootTaskId);
  }, [rootTaskId]);

  // Sync store graph → RF state, injecting delete capability into each node
  useEffect(() => {
    const enriched = (graph.nodes || []).map(n => ({
      ...n,
      data: {
        ...n.data,
        canDelete,
        onDelete: canDelete ? () => setDeleteTarget({ id: n.id, title: n.data?.title }) : undefined,
      },
    }));
    setNodes(enriched);
    setEdges(graph.edges || []);
  }, [graph, canDelete]);

  // Node drag stop → persist positions
  const onNodeDragStop = useCallback((_, node) => {
    clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => {
      updateNodePositions([{ taskId: node.id, x: node.position.x, y: node.position.y }]);
    }, 800);
  }, [updateNodePositions]);

  // Click node → open detail panel
  const onNodeClick = useCallback((_, node) => {
    selectNode(node);
  }, [selectNode]);

  // Start connecting (for dependency edges)
  const onConnectStart = useCallback((_, { nodeId }) => {
    setConnectingSource(nodeId);
  }, []);

  // Drop connection → create dependency
  const onConnectEnd = useCallback(async (event) => {
    const targetEl = document.elementFromPoint(event.clientX, event.clientY);
    const targetNode = targetEl?.closest('.react-flow__node');
    const targetId = targetNode?.dataset?.id;

    if (targetId && connectingSource && targetId !== connectingSource) {
      try {
        await addDependency(connectingSource, targetId, 'finish_to_start');
        toast.success('Dependency added');
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || 'Failed to add dependency');
      }
    }
    setConnectingSource(null);
  }, [connectingSource, addDependency]);

  // Pane click → deselect
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleAddSubtask = useCallback((parentId, parentTitle) => {
    const node = graph.nodes.find(n => n.id === parentId);
    setAddSubtaskState({
      parentId,
      parentTitle: parentTitle || node?.data?.title || 'Task',
      parentDepartment: node?.data?.department || null,
    });
  }, [graph.nodes]);

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteTask(id);
      toast.success(`"${title}" deleted`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) { toast.error('Template name required'); return; }
    try {
      await saveTemplate(rootTaskId, templateName);
      toast.success('Template saved!');
      setShowSaveTemplate(false);
      setTemplateName('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    }
  };

  const handleApplyTemplate = async (templateId) => {
    try {
      await applyTemplate(rootTaskId, templateId);
      toast.success('Template applied!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply template');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading workflow…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-xs">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-sm font-medium text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#6366f1', strokeWidth: 2 },
          animated: false,
        }}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '6,3' }}
        snapToGrid
        snapGrid={[20, 20]}
        selectNodesOnDrag={false}
      >
        <Background color="#cbd5e1" gap={24} size={1.5} />
        <Controls showInteractive={false} className="shadow-lg rounded-xl overflow-hidden" />
        <MiniMap
          nodeColor={getMinimapColor}
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="shadow-xl rounded-xl overflow-hidden border border-gray-200"
          style={{ background: '#f1f5f9' }}
        />

        {/* Custom toolbar */}
        <WorkflowToolbar
          rootTaskId={rootTaskId}
          onAddSubtask={(id) => handleAddSubtask(id, null)}
          onSaveTemplate={() => setShowSaveTemplate(true)}
          onApplyTemplate={handleApplyTemplate}
        />

        {/* Stats bar */}
        {nodes.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-lg px-4 py-2 z-10">
            <StatBadge color="bg-slate-400"  label="Total"    value={nodes.length} />
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <StatBadge color="bg-green-500"  label="Done"     value={nodes.filter(n => n.data?.status === 'Completed').length} />
            <StatBadge color="bg-yellow-500" label="Active"   value={nodes.filter(n => n.data?.status === 'In Progress').length} />
            <StatBadge color="bg-indigo-500" label="Approval" value={nodes.filter(n => n.data?.status === 'Approval Pending').length} />
            {nodes.filter(n => n.data?.isOverdue && n.data?.status !== 'Completed').length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <StatBadge color="bg-red-500" label="Overdue" value={nodes.filter(n => n.data?.isOverdue && n.data?.status !== 'Completed').length} />
              </>
            )}
          </div>
        )}
      </ReactFlow>

      {/* Detail panel */}
      {showDetailPanel && selectedNode && (
        <TaskDetailPanel
          onAddSubtask={(id, title) => handleAddSubtask(id, title)}
        />
      )}

      {/* Add subtask modal */}
      {addSubtaskState && (
        <AddSubtaskModal
          parentTaskId={addSubtaskState.parentId}
          parentTitle={addSubtaskState.parentTitle}
          parentDepartment={addSubtaskState.parentDepartment}
          onClose={() => setAddSubtaskState(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this task?"
        message={`"${deleteTarget?.title}" and all its subtasks will be permanently deleted. This cannot be undone.`}
        confirmLabel="Yes, Delete"
        confirmColor="red"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Save template modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Save as Workflow Template</h3>
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Template name…"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveTemplate(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSaveTemplate} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ color, label, value }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-[11px] font-bold text-gray-800">{value}</span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

export default function WorkflowTree({ rootTaskId }) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas rootTaskId={rootTaskId} />
    </ReactFlowProvider>
  );
}
