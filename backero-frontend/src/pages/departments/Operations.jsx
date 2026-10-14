import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { Wrench } from 'lucide-react';

export default function OperationsDept() {
  return (
    <DeptDashboard
      dept="Operations"
      color="#6366f1"
      description="Operations & Process Management"
      icon={Wrench}
    />
  );
}
