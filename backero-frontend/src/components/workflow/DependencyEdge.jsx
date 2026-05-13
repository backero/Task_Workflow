import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getStraightPath, getBezierPath } from 'reactflow';

const DependencyEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, markerEnd, style,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeDasharray: '6 3',
          stroke: '#f59e0b',
          strokeWidth: 2,
        }}
      />
      {data?.dependencyType && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full shadow-sm"
          >
            {data.dependencyType.replace(/_/g, ' ')}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DependencyEdge.displayName = 'DependencyEdge';
export default DependencyEdge;
