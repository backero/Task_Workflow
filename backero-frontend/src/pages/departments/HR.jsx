import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { UserGroupIcon } from '@heroicons/react/24/outline';

export default function HRDept() {
  return (
    <DeptDashboard
      dept="HR"
      color="#f59e0b"
      lightColor="#fffbeb"
      textColor="#b45309"
      borderColor="#fcd34d"
      description="Human Resources & People Operations"
      icon={UserGroupIcon}
    />
  );
}
