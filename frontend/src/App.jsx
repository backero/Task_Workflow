import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrgProvider } from './context/OrgContext'
import { SocketProvider } from './context/SocketContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import OTPVerify from './pages/OTPVerify'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import MyTasks from './pages/MyTasks'
import Members from './pages/Members'
import Profile from './pages/Profile'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Employees from './pages/Employees'
import EmployeeProfile from './pages/EmployeeProfile'
import Inventory from './pages/Inventory'
import Finance from './pages/Finance'
import Reports from './pages/Reports'

const OrgGuard = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user && !user.organizationId) return <Navigate to="/onboarding" replace />
  return children
}

const Protected = ({ children }) => (
  <ProtectedRoute>
    <OrgGuard>{children}</OrgGuard>
  </ProtectedRoute>
)

export default function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login"  element={<Login />} />
              <Route path="/verify" element={<OTPVerify />} />

              {/* Auth required — no org yet */}
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

              {/* Auth + Org required */}
              <Route path="/dashboard"    element={<Protected><Dashboard /></Protected>} />
              <Route path="/projects"     element={<Protected><Projects /></Protected>} />
              <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
              <Route path="/my-tasks"     element={<Protected><MyTasks /></Protected>} />
              <Route path="/members"      element={<Protected><Members /></Protected>} />
              <Route path="/profile"      element={<Protected><Profile /></Protected>} />
              <Route path="/analytics"    element={<Protected><Analytics /></Protected>} />
              <Route path="/settings"     element={<Protected><Settings /></Protected>} />

              {/* Phase 5 — Employee Management */}
              <Route path="/employees"       element={<Protected><Employees /></Protected>} />
              <Route path="/employees/:id"   element={<Protected><EmployeeProfile /></Protected>} />

              {/* Phase 6 — Inventory Management */}
              <Route path="/inventory"    element={<Protected><Inventory /></Protected>} />
              <Route path="/inventory/*"  element={<Protected><Inventory /></Protected>} />

              {/* Phase 7 — Finance Module */}
              <Route path="/finance"      element={<Protected><Finance /></Protected>} />
              <Route path="/finance/*"    element={<Protected><Finance /></Protected>} />

              {/* Phase 8 — Reports */}
              <Route path="/reports"      element={<Protected><Reports /></Protected>} />
              <Route path="/reports/*"    element={<Protected><Reports /></Protected>} />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </OrgProvider>
    </AuthProvider>
  )
}
