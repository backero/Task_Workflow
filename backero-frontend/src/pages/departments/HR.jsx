import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { Users } from 'lucide-react';

export default function HRDept() {
  return (
    <DeptDashboard
      dept="HR"
      color="#f59e0b"
      description="Human Resources & People Operations"
      icon={Users}
    />
  );
}
