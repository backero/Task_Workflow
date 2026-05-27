import React, { useState } from 'react';
import companyLogo from '../../assets/Backero.png';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import {
  HomeIcon, ClipboardDocumentListIcon, UsersIcon, ShoppingBagIcon,
  CubeIcon, BoltIcon, ChartBarIcon, CogIcon, MegaphoneIcon,
  BuildingStorefrontIcon, BeakerIcon, BanknotesIcon,
  ChevronDownIcon, ChevronRightIcon, Bars3Icon, UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

const SIDEBAR_BG = 'linear-gradient(180deg, #0c1445 0%, #0f1f5c 60%, #0a1835 100%)';

function NavItem({ item, collapsed }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  if (item.children) {
    const isActive = item.children.some((c) => location.pathname.startsWith(c.to));
    return (
      <div>
        <button
          onClick={() => setOpen((p) => !p)}
          className={clsx('sidebar-link w-full', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
        >
          <item.icon className={clsx('w-4.5 h-4.5 flex-shrink-0', isActive ? 'text-white' : 'text-white/50')} style={{ width: '18px', height: '18px' }} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {open
                ? <ChevronDownIcon className="w-3.5 h-3.5 text-white/40" />
                : <ChevronRightIcon className="w-3.5 h-3.5 text-white/40" />}
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-9 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
            {item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                className={({ isActive }) =>
                  clsx('block py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'text-white bg-white/10'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5')
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      className={({ isActive }) => clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="flex-shrink-0" style={{ width: '18px', height: '18px' }} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuthStore();
  const {
    can, isAdmin,
    canCRM, canInventory, canProduction, canFinance,
    canManagement, canApprovals,
  } = usePermissions();

  const groups = [];

  groups.push({
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: HomeIcon, exact: true }],
  });

  const workItems = [
    { label: 'Workflow Builder', to: '/workflow', icon: BoltIcon },
  ];
  if (canApprovals) {
    workItems.push({ label: 'Approval Queue', to: '/tasks/approvals', icon: ClipboardDocumentListIcon });
  }
  if (canCRM) {
    workItems.push({
      label: 'CRM & Sales', icon: UsersIcon, children: [
        { label: 'Lead Pipeline', to: '/crm/pipeline' },
        { label: 'Follow-up Calendar', to: '/crm/calendar' },
        { label: 'Technical Queries', to: '/crm/queries' },
      ],
    });
  }
  groups.push({ label: 'Work Management', items: workItems });

  const opsItems = [];
  if (canInventory) {
    opsItems.push({
      label: 'Inventory', icon: CubeIcon, children: [
        { label: 'Products', to: '/inventory/products' },
        { label: 'Stock Movements', to: '/inventory/movements' },
        { label: 'Low Stock Alerts', to: '/inventory/alerts' },
      ],
    });
  }
  if (canProduction) {
    opsItems.push({
      label: 'Production', icon: BoltIcon, children: [
        { label: 'Production Orders', to: '/production/orders' },
        { label: 'Quality Control', to: '/production/quality' },
        { label: 'Batch History', to: '/production/batches' },
      ],
    });
  }
  if (canFinance) {
    opsItems.push({
      label: 'Finance', icon: BanknotesIcon, children: [
        { label: 'Ledger', to: '/finance/ledger' },
        { label: 'Invoices', to: '/finance/invoices' },
        { label: 'Reports', to: '/finance/reports' },
      ],
    });
  }
  if (opsItems.length > 0) {
    groups.push({ label: 'Operations', items: opsItems });
  }

  const deptItems = [];
  if (can('dept.marketing'))   deptItems.push({ label: 'Marketing',   to: '/departments/marketing',   icon: MegaphoneIcon });
  if (can('dept.marketplace')) deptItems.push({ label: 'Marketplace', to: '/departments/marketplace', icon: BuildingStorefrontIcon });
  if (can('dept.sales'))       deptItems.push({ label: 'Sales Dept',  to: '/departments/sales',       icon: ShoppingBagIcon });
  if (can('dept.rnd'))         deptItems.push({ label: 'R&D',         to: '/departments/rnd',         icon: BeakerIcon });
  if (can('dept.operations'))  deptItems.push({ label: 'Operations',  to: '/departments/operations',  icon: WrenchScrewdriverIcon });
  if (can('dept.hr'))          deptItems.push({ label: 'HR',          to: '/departments/hr',          icon: UserGroupIcon });
  if (deptItems.length > 0) {
    groups.push({ label: 'Departments', items: deptItems });
  }

  if (canManagement) {
    groups.push({
      label: 'Management',
      items: [
        { label: 'Team', to: '/management/team', icon: UserGroupIcon },
        { label: 'Employee Monitor', to: '/management/employees', icon: UsersIcon },
        { label: 'Dept Analytics', to: '/management/departments', icon: ChartBarIcon },
      ],
    });
  }

  return (
    <div className="flex flex-col h-full relative" style={{ background: SIDEBAR_BG }}>
      {/* Decorative glow top-right */}
      <div
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle at top right, #3b82f6, transparent 70%)' }}
      />

      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden">
          <img src={companyLogo} alt="Logo" className="h-7 w-auto object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate leading-tight">Backero</p>
            <p className="text-[10px] text-white/40 truncate">{user?.organizationId?.name || 'Enterprise'}</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-lg transition-colors hidden lg:flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        >
          <Bars3Icon className="w-4 h-4 text-white/50" />
        </button>
      </div>

      {/* Department badge */}
      {!collapsed && !isAdmin && user?.department && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[11px] font-semibold text-white/60 truncate">
            <span className="text-emerald-400">{user.department}</span>
            {' · '}{user.role?.replace('_', ' ')}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-5 mt-2">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.14em] px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.label} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User / Settings footer */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <NavLink
          to="/settings"
          className={({ isActive }) => clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
        >
          <CogIcon className="flex-shrink-0" style={{ width: '18px', height: '18px' }} />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        {!collapsed && user && (
          <div className="mt-3 flex items-center gap-2.5 px-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-black shadow-md"
              style={{ background: 'linear-gradient(135deg,#22c55e,#15803d)' }}
            >
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/80 truncate leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-white/35 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
