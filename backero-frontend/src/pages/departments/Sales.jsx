import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { ShoppingBag } from 'lucide-react';

export default function SalesDept() {
  return (
    <DeptDashboard
      dept="Sales"
      color="#16a34a"
      description="Sales Operations & Pipeline"
      icon={ShoppingBag}
    />
  );
}
