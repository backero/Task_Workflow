import React from 'react';
import ProductionSnapshot from '../dashboard/ProductionSnapshot';

// The Production department's page — just the Sample Production stat boxes plus a live
// "who's doing what today" roster, not the entire Sample Production / Batch Tracker page
// (that's still at /samples for the actual day-to-day work).
export default function RnDDept() {
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Department</h1>
          <p className="text-gray-500 text-sm">Live snapshot from Sample Production</p>
        </div>
      </div>
      <ProductionSnapshot department="Production" />
    </div>
  );
}
