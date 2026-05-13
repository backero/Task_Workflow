import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { BeakerIcon } from '@heroicons/react/24/outline';

export default function RnDDept() {
  return (
    <DeptDashboard
      dept="R&D"
      color="#0891b2"
      lightColor="#ecfeff"
      textColor="#0e7490"
      borderColor="#67e8f9"
      description="Research & Development Innovation"
      icon={BeakerIcon}
    />
  );
}
