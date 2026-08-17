import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../store/usePermissions';

export default function PermissionRoute({ module, children }) {
  const { can } = usePermissions();
  const modules = Array.isArray(module) ? module : [module];
  if (!modules.some((m) => can(m))) return <Navigate to="/" replace />;
  return children;
}
