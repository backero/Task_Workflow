import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

export default function OperationsDept() {
  return (
    <DeptDashboard
      dept="Operations"
      color="#6366f1"
      lightColor="#eef2ff"
      textColor="#4338ca"
      borderColor="#a5b4fc"
      description="Operations & Process Management"
      icon={WrenchScrewdriverIcon}
    />
  );
}
