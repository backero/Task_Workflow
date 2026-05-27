const ROLES = {
  SUPER_ADMIN: 'super_admin',
  CHAIRMAN: 'chairman',
  FOUNDER: 'founder',
  ADMIN: 'admin',
  MANAGER: 'manager',
  TEAM_LEAD: 'team_lead',
  MEMBER: 'member',
};

const ROLE_HIERARCHY = {
  super_admin: 7,
  chairman: 6,
  founder: 5,
  admin: 4,
  manager: 3,
  team_lead: 2,
  member: 1,
};

const TASK_STATUS = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  UNDER_REVIEW: 'Under Review',
  CHANGES_REQUESTED: 'Changes Requested',
  APPROVAL_PENDING: 'Approval Pending',
  COMPLETED: 'Completed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
  URGENT: 'urgent',
};

const DEPARTMENTS = {
  MARKETING: 'Marketing',
  MARKETPLACE: 'Marketplace',
  SALES: 'Sales',
  PRODUCTION: 'Production',
  RD: 'R&D',
  OPERATIONS: 'Operations',
  ACCOUNTS: 'Accounts & Finance',
  HR: 'HR',
  MANAGEMENT: 'Management',
};

const DEPARTMENT_COLORS = {
  Marketing: { primary: '#9333ea', secondary: '#ec4899', bg: '#fdf4ff' },
  Marketplace: { primary: '#f97316', secondary: '#fb923c', bg: '#fff7ed' },
  Sales: { primary: '#22c55e', secondary: '#16a34a', bg: '#f0fdf4' },
  Production: { primary: '#3b82f6', secondary: '#2563eb', bg: '#eff6ff' },
  'Accounts & Finance': { primary: '#10b981', secondary: '#059669', bg: '#f0fdf9' },
  'R&D': { primary: '#06b6d4', secondary: '#0891b2', bg: '#f0fdff' },
  Operations: { primary: '#6366f1', secondary: '#4f46e5', bg: '#f5f3ff' },
  HR: { primary: '#f59e0b', secondary: '#d97706', bg: '#fffbeb' },
  Management: { primary: '#1e293b', secondary: '#334155', bg: '#f8fafc' },
};

const LEAD_STATUS = {
  NEW: 'New Lead',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  FOLLOWUP: 'Follow-up',
  PROPOSAL: 'Proposal Sent',
  NEGOTIATION: 'Negotiation',
  QUERY_PENDING: 'Query Pending',
  IN_PROGRESS: 'In Progress',
  READY_TO_DISPATCH: 'Ready to Dispatch',
  DISPATCHED: 'Dispatched',
  WON: 'Payment Pending',
  LOST: 'Lost',
};

const LEAD_SOURCES = {
  WEBSITE: 'Website Form',
  WHATSAPP: 'WhatsApp Chatbot',
  GOOGLE_SHEETS: 'Google Sheets',
  META_ADS: 'Meta Ads',
  MANUAL: 'Manual Entry',
  IMPORT: 'Import',
  REFERRAL: 'Referral',
};

const STOCK_MOVEMENT_TYPES = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  SALE: 'SALE',
  PRODUCTION_USE: 'PRODUCTION_USE',
  PRODUCTION_OUTPUT: 'PRODUCTION_OUTPUT',
  QUALITY_TEST: 'QUALITY_TEST',
  RETURN: 'RETURN',
};

const PRODUCTION_STATUS = {
  PLANNED: 'Planned',
  MATERIAL_ALLOCATED: 'Material Allocated',
  IN_PRODUCTION: 'In Production',
  QUALITY_CHECK: 'Quality Check',
  PACKAGING: 'Packaging',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const MARKETPLACE_PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];

const MARKETING_TASK_TYPES = [
  'Instagram Reel',
  'YouTube Video',
  'Product Shoot',
  'Ad Creative',
  'Influencer Campaign',
  'Branding Campaign',
  'Blog Post',
  'Email Campaign',
];

const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
};

const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CHANGES_REQUESTED: 'changes_requested',
};

const SOCKET_EVENTS = {
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_REVIEW_REQUESTED: 'task_review_requested',
  TASK_APPROVED: 'task_approved',
  TASK_REJECTED: 'task_rejected',
  LEAD_ASSIGNED: 'lead_assigned',
  OVERDUE_ALERT: 'overdue_alert',
  INVENTORY_LOW: 'inventory_low',
  PRODUCTION_STARTED: 'production_started',
  INVOICE_PAID: 'invoice_paid',
  NOTIFICATION: 'notification',
  ESCALATION: 'escalation',
};

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  TASK_STATUS,
  TASK_PRIORITY,
  DEPARTMENTS,
  DEPARTMENT_COLORS,
  LEAD_STATUS,
  LEAD_SOURCES,
  STOCK_MOVEMENT_TYPES,
  PRODUCTION_STATUS,
  NOTIFICATION_PRIORITY,
  MARKETPLACE_PLATFORMS,
  MARKETING_TASK_TYPES,
  TRANSACTION_TYPES,
  APPROVAL_STATUS,
  SOCKET_EVENTS,
};
