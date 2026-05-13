import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrgProvider }           from './context/OrgContext'
import { SocketProvider }        from './context/SocketContext'
import ProtectedRoute            from './components/ProtectedRoute'
import { ROLE_HIERARCHY }        from './hooks/useRole'

import Login          from './pages/Login'
import OTPVerify      from './pages/OTPVerify'
import Onboarding     from './pages/Onboarding'
import Dashboard      from './pages/Dashboard'
import Projects       from './pages/Projects'
import ProjectDetail  from './pages/ProjectDetail'
import MyTasks        from './pages/MyTasks'
import Members        from './pages/Members'
import Profile        from './pages/Profile'
import Analytics      from './pages/Analytics'
import Settings       from './pages/Settings'
import Employees      from './pages/Employees'
import EmployeeProfile from './pages/EmployeeProfile'
import Inventory      from './pages/Inventory'
import Finance        from './pages/Finance'
import Production     from './pages/Production'
import Reports        from './pages/Reports'

/* ─── Guards ────────────────────────────────────────────────────────────────── */

const OrgGuard = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user && !user.organizationId) return <Navigate to="/onboarding" replace />
  return children
}

/* Wraps a route with authentication + org check */
const Protected = ({ children }) => (
  <ProtectedRoute>
    <OrgGuard>{children}</OrgGuard>
  </ProtectedRoute>
)

/*
 * RoleGuard — blocks route if user doesn't meet the role requirement.
 * minRole  : user's hierarchy level must be >= minRole's level
 * roles    : user's role must be in this exact list
 * Redirects to /dashboard on failure instead of showing a 403 page.
 */
const RoleGuard = ({ children, minRole, roles }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />

  const level = ROLE_HIERARCHY[user.role] || 1

  if (roles  && !roles.includes(user.role))            return <Navigate to="/dashboard" replace />
  if (minRole && level < (ROLE_HIERARCHY[minRole] || 0)) return <Navigate to="/dashboard" replace />

  return children
}

/* Combined helper: auth + org + role */
const RoleProtected = ({ children, minRole, roles }) => (
  <Protected>
    <RoleGuard minRole={minRole} roles={roles}>{children}</RoleGuard>
  </Protected>
)

/* ─── App ───────────────────────────────────────────────────────────────────── */

export default function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>

              {/* ── Public ──────────────────────────────────────────────── */}
              <Route path="/login"  element={<Login />} />
              <Route path="/verify" element={<OTPVerify />} />

              {/* ── Auth required — no org yet ──────────────────────────── */}
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

              {/* ── All authenticated users ─────────────────────────────── */}
              <Route path="/dashboard"    element={<Protected><Dashboard /></Protected>} />
              <Route path="/projects"     element={<Protected><Projects /></Protected>} />
              <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
              <Route path="/my-tasks"     element={<Protected><MyTasks /></Protected>} />
              <Route path="/profile"      element={<Protected><Profile /></Protected>} />

              {/* ── MANAGER / ADMIN / ORG_ADMIN / SUPER_ADMIN ───────────── */}
              <Route path="/analytics"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Analytics />
                  </RoleProtected>
                }
              />
              <Route path="/inventory"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Inventory />
                  </RoleProtected>
                }
              />
              <Route path="/inventory/*"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Inventory />
                  </RoleProtected>
                }
              />
              <Route path="/production"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Production />
                  </RoleProtected>
                }
              />
              <Route path="/production/*"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Production />
                  </RoleProtected>
                }
              />
              <Route path="/finance"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Finance />
                  </RoleProtected>
                }
              />
              <Route path="/finance/*"
                element={
                  <RoleProtected roles={['MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Finance />
                  </RoleProtected>
                }
              />

              {/* ── HR / MANAGER / ADMIN+ ───────────────────────────────── */}
              <Route path="/employees"
                element={
                  <RoleProtected roles={['HR','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Employees />
                  </RoleProtected>
                }
              />
              <Route path="/employees/:id"
                element={
                  <RoleProtected roles={['HR','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <EmployeeProfile />
                  </RoleProtected>
                }
              />
              <Route path="/reports"
                element={
                  <RoleProtected roles={['HR','MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Reports />
                  </RoleProtected>
                }
              />
              <Route path="/reports/*"
                element={
                  <RoleProtected roles={['HR','MANAGER','ADMIN','ORG_ADMIN','SUPER_ADMIN']}>
                    <Reports />
                  </RoleProtected>
                }
              />

              {/* ── ADMIN / ORG_ADMIN / SUPER_ADMIN only ────────────────── */}
              <Route path="/members"
                element={
                  <RoleProtected minRole="ADMIN">
                    <Members />
                  </RoleProtected>
                }
              />
              <Route path="/settings"
                element={
                  <RoleProtected minRole="ADMIN">
                    <Settings />
                  </RoleProtected>
                }
              />

              <Route path="*" element={<Navigate to="/login" replace />} />

            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </OrgProvider>
    </AuthProvider>
  )
}
