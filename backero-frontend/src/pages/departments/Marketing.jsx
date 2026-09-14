import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { Megaphone } from 'lucide-react';

export default function MarketingDept() {
  return (
    <DeptDashboard
      dept="Marketing"
      color="#9333ea"
      description="Campaign & Content Execution"
      icon={Megaphone}
    />
  );
}
