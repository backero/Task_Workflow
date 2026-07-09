import React from 'react';
import DeptDashboard from '../../components/departments/DeptDashboard';
import { CogIcon, CubeIcon, BeakerIcon } from '@heroicons/react/24/outline';

export default function RnDDept() {
  return (
    <DeptDashboard
      dept="Production"
      color="#ea580c"
      lightColor="#fff7ed"
      textColor="#c2410c"
      borderColor="#fb923c"
      description="Production Tasks & Work Updates"
      icon={CogIcon}
      quickLinks={[
        { label: 'Raw Materials',   to: '/inventory/rawmaterials', icon: BeakerIcon },
        { label: 'Product Catalog', to: '/inventory/catalog',      icon: CubeIcon   },
      ]}
    />
  );
}
