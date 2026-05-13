import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../store/usePermissions';

export default function PermissionRoute({ module, children }) {
  const { can } = usePermissions();
  if (!can(module)) return <Navigate to="/" replace />;
  return children;
}
