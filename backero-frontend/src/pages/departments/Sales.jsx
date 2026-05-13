import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { ShoppingBagIcon } from '@heroicons/react/24/outline';

export default function SalesDept() {
  return (
    <DeptDashboard
      dept="Sales"
      color="#16a34a"
      lightColor="#f0fdf4"
      textColor="#15803d"
      borderColor="#86efac"
      description="Sales Operations & Pipeline"
      icon={ShoppingBagIcon}
    />
  );
}
