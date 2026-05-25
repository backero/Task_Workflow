import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useSocketStore } from './store/useSocketStore';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';
import PermissionRoute from './components/common/PermissionRoute';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Onboarding from './pages/auth/Onboarding';

// Dashboard pages
import FounderDashboard from './pages/dashboard/FounderDashboard';
import ManagerDashboard from './pages/dashboard/ManagerDashboard';
import EmployeeDashboard from './pages/dashboard/EmployeeDashboard';

// Task pages
import KanbanView from './pages/tasks/KanbanView';
import MyTasks from './pages/tasks/MyTasks';
import TeamTasks from './pages/tasks/TeamTasks';
import ApprovalQueue from './pages/tasks/ApprovalQueue';
import TaskAnalytics from './pages/tasks/TaskAnalytics';
import CalendarView from './pages/tasks/CalendarView';

// CRM pages
import LeadPipeline from './pages/crm/LeadPipeline';
import LeadDetails from './pages/crm/LeadDetails';
import FollowUpCalendar from './pages/crm/FollowUpCalendar';
import TechnicalQueries from './pages/crm/TechnicalQueries';

// Inventory pages
import Products from './pages/inventory/Products';
import StockMovements from './pages/inventory/StockMovements';
import InventoryAlerts from './pages/inventory/InventoryAlerts';

// Production pages
import ProductionOrders from './pages/production/ProductionOrders';
import QualityControl from './pages/production/QualityControl';
import BatchHistory from './pages/production/BatchHistory';

// Finance pages
import Ledger from './pages/finance/Ledger';
import Invoices from './pages/finance/Invoices';
import FinanceReports from './pages/finance/FinanceReports';

// Department pages
import MarketingDept from './pages/departments/Marketing';
import MarketplaceDept from './pages/departments/Marketplace';
import SalesDept from './pages/departments/Sales';
import RnDDept from './pages/departments/RnD';
import OperationsDept from './pages/departments/Operations';
import HRDept from './pages/departments/HR';

// Management
import EmployeeMonitoring from './pages/management/EmployeeMonitoring';
import TeamManagement from './pages/management/TeamManagement';
import DepartmentAnalytics from './pages/management/DepartmentAnalytics';

// Settings
import Settings from './pages/settings/Settings';
import WhatsAppSetup from './pages/settings/WhatsAppSetup';

// Workflow
import WorkflowView from './pages/workflow/WorkflowView';
import WorkflowLanding from './pages/workflow/WorkflowLanding';
import DeptWorkflow from './pages/workflow/DeptWorkflow';

const SmartDashboard = () => {
  const { user } = useAuthStore();
  const role = user?.role;
  if (['founder', 'chairman', 'super_admin', 'admin'].includes(role)) return <FounderDashboard />;
  if (['manager', 'team_lead'].includes(role)) return <ManagerDashboard />;
  return <EmployeeDashboard />;
};

export default function App() {
  const { user, token } = useAuthStore();
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    if (token && user) {
      connect(token);
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [token]);

  // Apply dark mode: localStorage override → user.settings.theme → OS preference
  useEffect(() => {
    const stored = localStorage.getItem('backero-theme');
    const theme = stored || user?.settings?.theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    }
  }, [user?.settings?.theme]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<SmartDashboard />} />
          <Route path="/dashboard/founder" element={<FounderDashboard />} />
          <Route path="/dashboard/manager" element={<ManagerDashboard />} />
          <Route path="/dashboard/employee" element={<EmployeeDashboard />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Tasks */}
          <Route path="/tasks/my" element={<MyTasks />} />
          <Route path="/tasks/kanban" element={<KanbanView />} />
          <Route path="/tasks/team" element={<PermissionRoute module="tasks.team"><TeamTasks /></PermissionRoute>} />
          <Route path="/tasks/approvals" element={<PermissionRoute module="tasks.approvals"><ApprovalQueue /></PermissionRoute>} />
          <Route path="/tasks/calendar" element={<PermissionRoute module="tasks.calendar"><CalendarView /></PermissionRoute>} />
          <Route path="/tasks/analytics" element={<PermissionRoute module="tasks.analytics"><TaskAnalytics /></PermissionRoute>} />

          {/* CRM */}
          <Route path="/crm/pipeline" element={<PermissionRoute module="crm"><LeadPipeline /></PermissionRoute>} />
          <Route path="/crm/leads/:id" element={<PermissionRoute module="crm"><LeadDetails /></PermissionRoute>} />
          <Route path="/crm/calendar" element={<PermissionRoute module="crm"><FollowUpCalendar /></PermissionRoute>} />
          <Route path="/crm/queries" element={<TechnicalQueries />} />

          {/* Inventory */}
          <Route path="/inventory/products" element={<PermissionRoute module="inventory"><Products /></PermissionRoute>} />
          <Route path="/inventory/movements" element={<PermissionRoute module="inventory"><StockMovements /></PermissionRoute>} />
          <Route path="/inventory/alerts" element={<PermissionRoute module="inventory"><InventoryAlerts /></PermissionRoute>} />

          {/* Production */}
          <Route path="/production/orders" element={<PermissionRoute module="production"><ProductionOrders /></PermissionRoute>} />
          <Route path="/production/quality" element={<PermissionRoute module="production"><QualityControl /></PermissionRoute>} />
          <Route path="/production/batches" element={<PermissionRoute module="production"><BatchHistory /></PermissionRoute>} />

          {/* Finance */}
          <Route path="/finance/ledger" element={<PermissionRoute module="finance"><Ledger /></PermissionRoute>} />
          <Route path="/finance/invoices" element={<PermissionRoute module="finance"><Invoices /></PermissionRoute>} />
          <Route path="/finance/reports" element={<PermissionRoute module="finance"><FinanceReports /></PermissionRoute>} />

          {/* Departments */}
          <Route path="/departments/marketing" element={<PermissionRoute module="dept.marketing"><MarketingDept /></PermissionRoute>} />
          <Route path="/departments/marketplace" element={<PermissionRoute module="dept.marketplace"><MarketplaceDept /></PermissionRoute>} />
          <Route path="/departments/sales" element={<PermissionRoute module="dept.sales"><SalesDept /></PermissionRoute>} />
          <Route path="/departments/rnd" element={<PermissionRoute module="dept.rnd"><RnDDept /></PermissionRoute>} />
          <Route path="/departments/operations" element={<PermissionRoute module="dept.operations"><OperationsDept /></PermissionRoute>} />
          <Route path="/departments/hr" element={<PermissionRoute module="dept.hr"><HRDept /></PermissionRoute>} />

          {/* Management */}
          <Route path="/management/employees" element={<PermissionRoute module="management"><EmployeeMonitoring /></PermissionRoute>} />
          <Route path="/management/team" element={<PermissionRoute module="management"><TeamManagement /></PermissionRoute>} />
          <Route path="/management/departments" element={<PermissionRoute module="management"><DepartmentAnalytics /></PermissionRoute>} />

          {/* Workflow */}
          <Route path="/workflow" element={<WorkflowLanding />} />
          <Route path="/workflow/:taskId" element={<WorkflowView />} />
          <Route path="/dept-workflow" element={<DeptWorkflow />} />

          {/* Settings */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/whatsapp" element={<PermissionRoute module="management"><WhatsAppSetup /></PermissionRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
