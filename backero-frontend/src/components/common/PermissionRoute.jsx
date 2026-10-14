import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../store/usePermissions';

// `module` gates by the existing department/role → module-string system (can()).
// `permission` gates by a raw permission-string code on user.permissions[] (hasPermission()) —
// used by the Attendance Tracker pages, which mirror the backend's own permission-string model
// instead of the department-module one. Either or both may be passed; passing both requires
// BOTH to allow (module AND permission), matching how routes that need both would compose them —
// in practice each route currently uses only one or the other.
export default function PermissionRoute({ module, permission, children }) {
  const { can, hasPermission } = usePermissions();

  if (module) {
    const modules = Array.isArray(module) ? module : [module];
    if (!modules.some((m) => can(m))) return <Navigate to="/" replace />;
  }

  if (permission) {
    const perms = Array.isArray(permission) ? permission : [permission];
    if (!perms.some((p) => hasPermission(p))) return <Navigate to="/" replace />;
  }

  return children;
}
