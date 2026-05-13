import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { MegaphoneIcon } from '@heroicons/react/24/outline';

export default function MarketingDept() {
  return (
    <DeptDashboard
      dept="Marketing"
      color="#9333ea"
      lightColor="#faf5ff"
      textColor="#7e22ce"
      borderColor="#d8b4fe"
      description="Campaign & Content Execution"
      icon={MegaphoneIcon}
    />
  );
}
