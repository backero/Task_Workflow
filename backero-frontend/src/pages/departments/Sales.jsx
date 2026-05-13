import React from 'react';
import { Link } from 'react-router-dom';
export default function SalesDept() {
  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title" style={{ color: '#22c55e' }}>Sales Department</h1>
        <Link to="/crm/pipeline" className="btn-primary" style={{ background: '#22c55e' }}>Open CRM Pipeline</Link>
      </div>
      <div className="card p-6 text-center text-gray-400">
        <p>Sales operations are managed through the CRM module.</p>
        <Link to="/crm/pipeline" className="text-green-600 text-sm mt-2 inline-block">→ Go to Lead Pipeline</Link>
      </div>
    </div>
  );
}
