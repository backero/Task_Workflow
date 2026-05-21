// Route-aware help content for every page in the app.
// To add/edit instructions: find the matching route key and update the sections array.
// Each section has a title and steps array.

const HELP = {

  // ── Dashboard ────────────────────────────────────────────────────────────────
  '/': {
    page: 'Dashboard',
    intro: 'Your personal command center. Shows what matters most based on your role.',
    sections: [
      {
        title: 'Reading your dashboard',
        steps: [
          'The cards at the top show your key numbers — tasks due today, pending approvals, team progress.',
          'Scroll down to see department-wise summaries and recent activity.',
          'Numbers in red mean something needs urgent attention.',
        ],
      },
      {
        title: 'Navigating from here',
        steps: [
          'Click any task card to open the full task detail.',
          'Use the sidebar on the left to jump to any section of the app.',
          'The notification bell (top right) shows recent updates from your team.',
        ],
      },
    ],
  },

  '/dashboard/founder': {
    page: 'Founder Dashboard',
    intro: 'Full business overview — all departments, revenue, team performance in one view.',
    sections: [
      {
        title: 'What you see here',
        steps: [
          'Top KPIs: total active tasks, completion rate, overdue items across the entire org.',
          'Department health bars show how each team is performing this week.',
          'Revenue and CRM pipeline snapshot is shown if Finance and CRM data is entered.',
        ],
      },
      {
        title: 'Taking action',
        steps: [
          'Click any department card to drill into that department\'s page.',
          'Use Workflow Builder to create cross-department projects.',
          'Check the Approval Queue if you see pending approvals highlighted.',
        ],
      },
    ],
  },

  '/dashboard/manager': {
    page: 'Manager Dashboard',
    intro: 'Your department\'s performance and your team\'s task load at a glance.',
    sections: [
      {
        title: 'Monitoring your team',
        steps: [
          'Team task overview shows who has too many tasks and who has capacity.',
          'Overdue tasks are highlighted in red — click to see details and reassign if needed.',
          'Approval requests from your team members appear here for quick action.',
        ],
      },
      {
        title: 'Managing workload',
        steps: [
          'Go to Team Tasks to see every task assigned within your department.',
          'Use Kanban View for a visual drag-and-drop status board.',
          'Go to Workflow Builder to assign cross-dept subtasks to your team.',
        ],
      },
    ],
  },

  '/dashboard/employee': {
    page: 'Employee Dashboard',
    intro: 'Your personal work view — today\'s tasks, upcoming deadlines, your progress.',
    sections: [
      {
        title: 'Starting your day',
        steps: [
          'Check "Due Today" tasks first — complete these before anything else.',
          'Tasks marked In Progress are already started — continue from where you left off.',
          'If a task says "Approval Pending", you\'ve submitted it and are waiting for manager review.',
        ],
      },
      {
        title: 'Updating your work',
        steps: [
          'Go to My Tasks to update task status — In Progress, Completed, etc.',
          'Add notes or comments to a task so your manager knows what you did.',
          'If a task is blocked or needs help, change status to Reopened and add a note explaining why.',
        ],
      },
    ],
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  '/tasks/my': {
    page: 'My Tasks',
    intro: 'All tasks assigned to you, sorted by priority and due date.',
    sections: [
      {
        title: 'Viewing your tasks',
        steps: [
          'Tasks are sorted by due date — nearest deadline at the top.',
          'Use the filter buttons to view by status: All, In Progress, Pending, Completed.',
          'A red border means the task is overdue.',
        ],
      },
      {
        title: 'Updating a task',
        steps: [
          'Click any task to open its detail panel.',
          'Change the status using the dropdown — Pending → In Progress → Completed.',
          'Add a comment to leave a note for your manager before marking complete.',
          'If the task has subtasks, complete all subtasks first before marking the parent done.',
        ],
      },
      {
        title: 'Submitting for approval',
        steps: [
          'Some tasks require manager approval before they close.',
          'When you mark such a task Completed, it moves to "Approval Pending" automatically.',
          'Your manager will approve or reopen it with feedback.',
        ],
      },
    ],
  },

  '/tasks/kanban': {
    page: 'Kanban Board',
    intro: 'Visual board showing all tasks organized by status columns.',
    sections: [
      {
        title: 'Using the board',
        steps: [
          'Columns from left to right: Pending → Assigned → In Progress → Approval Pending → Completed.',
          'Drag and drop a task card from one column to another to update its status.',
          'Each card shows the assignee avatar, due date, and priority.',
        ],
      },
      {
        title: 'Filtering the board',
        steps: [
          'Use the filter bar at the top to filter by assignee, platform, or department.',
          'Click a task card to open full details without leaving the board.',
        ],
      },
    ],
  },

  '/tasks/team': {
    page: 'Team Tasks',
    intro: 'View and manage all tasks across your team (managers and admins only).',
    sections: [
      {
        title: 'Reviewing team tasks',
        steps: [
          'See every task assigned to anyone in your department.',
          'Sort by due date, assignee, or status using the column headers.',
          'Tasks highlighted in red are overdue — prioritize these.',
        ],
      },
      {
        title: 'Reassigning tasks',
        steps: [
          'Click a task to open it, then change the Assigned To field to a different team member.',
          'Add a note explaining the reassignment so both parties are informed.',
        ],
      },
    ],
  },

  '/tasks/approvals': {
    page: 'Approval Queue',
    intro: 'Tasks submitted by your team that are waiting for your approval.',
    sections: [
      {
        title: 'Reviewing a submission',
        steps: [
          'Each card shows the task title, who submitted it, and when.',
          'Click the card to see the full task details and any notes the employee added.',
          'Check if the work meets the requirement before approving.',
        ],
      },
      {
        title: 'Approving or rejecting',
        steps: [
          'Click Approve to mark the task as Completed — the employee is notified.',
          'Click Reopen to send it back with your feedback — add a comment explaining what needs to be fixed.',
          'Reopened tasks go back to the employee\'s My Tasks with your comment visible.',
        ],
      },
    ],
  },

  '/tasks/calendar': {
    page: 'Task Calendar',
    intro: 'Month view of all tasks and their due dates.',
    sections: [
      {
        title: 'Navigating the calendar',
        steps: [
          'Each dot or card on a date represents a task due that day.',
          'Click a date to see all tasks due on that day.',
          'Use the arrows to go to next/previous month.',
        ],
      },
      {
        title: 'Planning ahead',
        steps: [
          'Look for days with too many tasks stacked — consider reassigning to even the load.',
          'Click any task on the calendar to open and update it directly.',
        ],
      },
    ],
  },

  '/tasks/analytics': {
    page: 'Task Analytics',
    intro: 'Charts and numbers showing task completion trends and team performance.',
    sections: [
      {
        title: 'Reading the charts',
        steps: [
          'Completion rate chart shows % of tasks finished on time vs. overdue.',
          'Bar chart breaks down task count by department or assignee.',
          'Use the date range filter to compare different time periods.',
        ],
      },
      {
        title: 'Using insights',
        steps: [
          'If a department\'s completion rate is low, drill into Team Tasks for that department.',
          'High overdue count usually means tasks are under-resourced or deadline is unrealistic.',
        ],
      },
    ],
  },

  // ── CRM ──────────────────────────────────────────────────────────────────────
  '/crm/pipeline': {
    page: 'Lead Pipeline',
    intro: 'Track all sales leads through stages from first contact to closed deal.',
    sections: [
      {
        title: 'Pipeline stages',
        steps: [
          'Stages from left to right: New Lead → Contacted → Proposal Sent → Negotiation → Closed Won / Closed Lost.',
          'Drag a lead card from one stage to the next as it progresses.',
          'Each card shows the lead name, deal value, and last contact date.',
        ],
      },
      {
        title: 'Adding a new lead',
        steps: [
          'Click the + button at the top of the New Lead column.',
          'Fill in contact name, company, phone, email, and expected deal value.',
          'Assign the lead to a sales team member.',
        ],
      },
      {
        title: 'Following up',
        steps: [
          'Open a lead card and click "Add Follow-up" to schedule the next call or meeting.',
          'Follow-ups appear in the Follow-up Calendar so nothing is missed.',
          'Always add a note after each call so the team has full context.',
        ],
      },
    ],
  },

  '/crm/leads/:id': {
    page: 'Lead Details',
    intro: 'Full history and details of a single lead — all calls, notes, and follow-ups in one place.',
    sections: [
      {
        title: 'Reading lead history',
        steps: [
          'The timeline at the bottom shows every interaction with this lead in chronological order.',
          'Notes, calls, emails, and status changes are all logged here.',
        ],
      },
      {
        title: 'Updating the lead',
        steps: [
          'Edit contact info by clicking the pencil icon next to any field.',
          'Change pipeline stage using the Stage dropdown at the top.',
          'Add a new note or follow-up using the buttons on the right panel.',
        ],
      },
    ],
  },

  '/crm/calendar': {
    page: 'Follow-up Calendar',
    intro: 'All scheduled follow-ups and calls with leads, shown in calendar format.',
    sections: [
      {
        title: 'Using the calendar',
        steps: [
          'Each event is a scheduled follow-up with a lead.',
          'Click an event to see the lead details and your notes for the call.',
          'Green events are completed, yellow are upcoming, red are missed.',
        ],
      },
      {
        title: 'Adding a follow-up',
        steps: [
          'Click any empty slot on the calendar to schedule a new follow-up.',
          'Or go to the lead\'s detail page and click "Add Follow-up" from there.',
        ],
      },
    ],
  },

  // ── Inventory ─────────────────────────────────────────────────────────────────
  '/inventory/products': {
    page: 'Products',
    intro: 'Your full product catalog with current stock levels and pricing.',
    sections: [
      {
        title: 'Viewing products',
        steps: [
          'Each row shows SKU, product name, category, current stock, unit, and selling price.',
          'Red stock number means the item is below the minimum stock threshold.',
          'Use the search bar to find a product by name or SKU.',
        ],
      },
      {
        title: 'Adding a product',
        steps: [
          'Click "Add Product" button at the top right.',
          'Fill in SKU, name, category, unit (pcs/kg/L etc.), minimum stock level, and price.',
          'After adding, go to Stock Movements to record the opening stock.',
        ],
      },
    ],
  },

  '/inventory/movements': {
    page: 'Stock Movements',
    intro: 'Record every stock addition (IN) and removal (OUT) to keep inventory accurate.',
    sections: [
      {
        title: 'Recording a movement',
        steps: [
          'Click "Add Movement" and choose IN (stock received) or OUT (stock consumed/sold).',
          'Select the product, enter quantity, and add a note (e.g., "Received from supplier").',
          'The product\'s stock level updates automatically.',
        ],
      },
      {
        title: 'Reading the log',
        steps: [
          'Each row shows date, product, IN or OUT, quantity, and who recorded it.',
          'Filter by product or date range to trace a specific item\'s movement history.',
        ],
      },
    ],
  },

  '/inventory/alerts': {
    page: 'Inventory Alerts',
    intro: 'Products that are running low or out of stock — requires immediate attention.',
    sections: [
      {
        title: 'Reading alerts',
        steps: [
          'Red alerts mean stock is at 0 — production or sales may be blocked.',
          'Yellow alerts mean stock is below the minimum threshold — reorder soon.',
          'The "Days Remaining" column estimates how long current stock will last based on recent usage.',
        ],
      },
      {
        title: 'Acting on an alert',
        steps: [
          'Click the product to go to its details page.',
          'Contact the supplier and record the incoming stock in Stock Movements once received.',
          'Update the minimum threshold if it\'s triggering alerts too early.',
        ],
      },
    ],
  },

  // ── Production ───────────────────────────────────────────────────────────────
  '/production/orders': {
    page: 'Production Orders',
    intro: 'Manufacturing orders — what needs to be made, how much, and by when.',
    sections: [
      {
        title: 'Creating a production order',
        steps: [
          'Click "New Order" and select the product to be manufactured.',
          'Enter target quantity and deadline.',
          'Assign to the production team lead.',
        ],
      },
      {
        title: 'Tracking progress',
        steps: [
          'Orders move through: Pending → In Production → Quality Check → Completed.',
          'Click an order to update its status or add notes.',
          'Completed orders automatically update inventory stock (if linked).',
        ],
      },
    ],
  },

  '/production/quality': {
    page: 'Quality Control',
    intro: 'QC checks for batches before they are approved for dispatch or storage.',
    sections: [
      {
        title: 'Running a QC check',
        steps: [
          'Select the batch that just completed production.',
          'Fill in the QC parameters — weight, appearance, test results, etc.',
          'Mark as Passed or Failed with a reason note.',
        ],
      },
      {
        title: 'Failed batches',
        steps: [
          'A failed batch is flagged and cannot be dispatched until re-checked.',
          'Add a rejection note explaining what failed and who needs to fix it.',
          'Rework the batch, then run QC again to clear the flag.',
        ],
      },
    ],
  },

  '/production/batches': {
    page: 'Batch History',
    intro: 'Full record of all past production batches and their QC outcomes.',
    sections: [
      {
        title: 'Using batch history',
        steps: [
          'Each row shows batch number, product, quantity, date, and QC result.',
          'Use date filter to find batches from a specific period.',
          'Click a batch to see its full QC details and production notes.',
        ],
      },
    ],
  },

  // ── Finance ───────────────────────────────────────────────────────────────────
  '/finance/ledger': {
    page: 'Ledger',
    intro: 'All financial entries — income, expenses, and transfers — in chronological order.',
    sections: [
      {
        title: 'Reading the ledger',
        steps: [
          'Each row is one financial entry: date, description, category, debit, credit, and running balance.',
          'Green rows are income (credit), red rows are expenses (debit).',
          'The balance column shows your running total after each entry.',
        ],
      },
      {
        title: 'Adding an entry',
        steps: [
          'Click "Add Entry" and fill in the date, description, category, and amount.',
          'Select Debit (money going out) or Credit (money coming in).',
          'Add a reference note like invoice number or receipt ID for traceability.',
        ],
      },
    ],
  },

  '/finance/invoices': {
    page: 'Invoices',
    intro: 'Create, track, and manage invoices sent to clients.',
    sections: [
      {
        title: 'Creating an invoice',
        steps: [
          'Click "New Invoice" and select or type the client name.',
          'Add line items — product/service, quantity, rate.',
          'Set the due date and payment terms.',
          'Click Generate to create the invoice — you can download it as PDF.',
        ],
      },
      {
        title: 'Tracking payment',
        steps: [
          'Status shows: Draft → Sent → Paid / Overdue.',
          'When payment is received, open the invoice and mark it as Paid.',
          'Overdue invoices are highlighted in red — follow up with the client.',
        ],
      },
    ],
  },

  '/finance/reports': {
    page: 'Finance Reports',
    intro: 'P&L summary, expense breakdown, and revenue trends by period.',
    sections: [
      {
        title: 'Reading reports',
        steps: [
          'Use the date range picker to select the period — this month, last month, or custom.',
          'P&L shows total income minus total expenses = net profit/loss.',
          'Category breakdown shows where most money is being spent.',
        ],
      },
      {
        title: 'Exporting reports',
        steps: [
          'Click the Export button to download as Excel or PDF.',
          'Share with your accountant or use for tax filing.',
        ],
      },
    ],
  },

  // ── Departments ───────────────────────────────────────────────────────────────
  '/departments/marketplace': {
    page: 'Marketplace Department',
    intro: 'Manage your Amazon, Flipkart, Meesho and other platform operations — daily tasks, weekly plans, and KPIs.',
    sections: [
      {
        title: 'Overview tab',
        steps: [
          'Shows all marketplace tasks across platforms and their status.',
          'Platform Task Breakdown panel shows completion % per platform — click a platform to filter.',
          'Click "Assign in Workflow Builder" to create cross-dept tasks related to marketplace.',
        ],
      },
      {
        title: 'Plan tab — getting started',
        steps: [
          'Click "HTML Template" to download a pre-filled editable plan for your platform.',
          'Open the downloaded .html file in your browser — click cells to edit tasks directly.',
          'When done editing, press Ctrl+S (Cmd+S on Mac) to save the file.',
          'Come back to the app, click "Import Plan", and upload your saved .html file.',
          'Your 12-week plan is now loaded into the app.',
        ],
      },
      {
        title: 'Plan tab — daily use',
        steps: [
          'Select the current week from the dropdown at the top.',
          'Check off tasks as you complete them — progress saves automatically.',
          'Fill in KPI fields (CTR, CVR, ACOS, Ad Spend) daily to track performance.',
          'If a metric hits the stop-loss threshold, a red alert appears automatically.',
        ],
      },
      {
        title: 'Updating your plan',
        steps: [
          'Download the template again — your existing tasks will be pre-filled.',
          'Edit in the browser, save, and re-import — the old plan is replaced.',
        ],
      },
    ],
  },

  '/departments/marketing': {
    page: 'Marketing Department',
    intro: 'Track marketing campaigns, content tasks, and performance metrics.',
    sections: [
      {
        title: 'Using the marketing dashboard',
        steps: [
          'Overview tab shows active campaigns and task status for the marketing team.',
          'Filter by campaign or assignee to focus on specific work.',
          'Create new campaign tasks using the + button or via Workflow Builder.',
        ],
      },
      {
        title: 'Tracking a campaign',
        steps: [
          'Each campaign is a workflow — create one in Workflow Builder with subtasks for design, copy, scheduling.',
          'Assign each subtask to the right team member.',
          'Update task status as work progresses — the campaign completion bar updates automatically.',
        ],
      },
    ],
  },

  '/departments/sales': {
    page: 'Sales Department',
    intro: 'Sales team tasks, targets, and follow-up actions all in one place.',
    sections: [
      {
        title: 'Daily sales workflow',
        steps: [
          'Check today\'s tasks — calls to make, proposals to send, meetings to attend.',
          'After each call, update the lead in CRM Pipeline with outcome notes.',
          'Mark tasks complete as you go — your manager sees real-time progress.',
        ],
      },
      {
        title: 'Hitting targets',
        steps: [
          'Your weekly target and current performance are shown in the header KPIs.',
          'If you\'re behind target, check with your manager for priority leads to focus on.',
        ],
      },
    ],
  },

  '/departments/rnd': {
    page: 'R&D Department',
    intro: 'Research projects, formulation tasks, and product development tracking.',
    sections: [
      {
        title: 'Managing research projects',
        steps: [
          'Each research project runs as a Workflow — create in Workflow Builder.',
          'Break the project into phases: Research → Formulation → Testing → Approval.',
          'Assign each phase to the relevant chemist or researcher.',
        ],
      },
      {
        title: 'Logging results',
        steps: [
          'Add notes or attachments to tasks to record test results, formulas, or observations.',
          'Use the QC module in Production for formal batch testing before scaling up.',
        ],
      },
    ],
  },

  '/departments/operations': {
    page: 'Operations Department',
    intro: 'Day-to-day operational tasks — logistics, procurement, vendor management.',
    sections: [
      {
        title: 'Operational tasks',
        steps: [
          'Today\'s operations tasks are listed by priority.',
          'Vendor follow-ups, dispatch tracking, and procurement orders all appear here.',
          'Mark tasks complete and add notes on outcomes (e.g., "Vendor confirmed delivery by Friday").',
        ],
      },
    ],
  },

  '/departments/hr': {
    page: 'HR Department',
    intro: 'Employee onboarding, attendance, leave requests, and HR task management.',
    sections: [
      {
        title: 'HR task management',
        steps: [
          'HR tasks like onboarding a new employee, preparing payroll, or policy updates appear here.',
          'Assign tasks to HR team members with deadlines.',
          'Track completion to ensure compliance and timely processing.',
        ],
      },
      {
        title: 'Managing employees',
        steps: [
          'Go to Management → Team to add or edit employee profiles.',
          'Set roles and department assignments from there.',
        ],
      },
    ],
  },

  // ── Management ────────────────────────────────────────────────────────────────
  '/management/employees': {
    page: 'Employee Monitoring',
    intro: 'Real-time view of what every employee is working on and their task load.',
    sections: [
      {
        title: 'Reading the monitoring view',
        steps: [
          'Each employee card shows: tasks assigned, tasks completed today, and current active task.',
          'Last active time shows when they last used the app.',
          'Red indicator means they have overdue tasks.',
        ],
      },
      {
        title: 'Taking action',
        steps: [
          'Click an employee card to see their full task list.',
          'If someone is overloaded, reassign tasks to team members with lower load.',
          'If someone has been inactive for too long, follow up directly.',
        ],
      },
    ],
  },

  '/management/team': {
    page: 'Team Management',
    intro: 'Add, edit, or deactivate team members and manage their roles and permissions.',
    sections: [
      {
        title: 'Adding a new employee',
        steps: [
          'Click "Add Employee" and fill in their name, email, phone, and role.',
          'Set their department and assign a role: Admin, Manager, or Employee.',
          'They will receive a login OTP on their registered phone/email to set up their account.',
        ],
      },
      {
        title: 'Changing roles or departments',
        steps: [
          'Click the edit icon on an employee card.',
          'Change their role or department as needed and save.',
          'Role changes take effect immediately — they may gain or lose access to certain pages.',
        ],
      },
      {
        title: 'Deactivating an employee',
        steps: [
          'Click the deactivate button on the employee card.',
          'Deactivated accounts cannot log in but their task history is preserved.',
          'Reassign their pending tasks before deactivating.',
        ],
      },
    ],
  },

  '/management/departments': {
    page: 'Department Analytics',
    intro: 'Compare performance across all departments — task completion, workload, and trends.',
    sections: [
      {
        title: 'Understanding the charts',
        steps: [
          'Each department bar shows task completion rate for the selected period.',
          'Hover over any bar to see the exact numbers.',
          'Use the period dropdown to compare this week vs. last week or this month.',
        ],
      },
      {
        title: 'Drilling down',
        steps: [
          'Click a department bar to see that department\'s tasks in detail.',
          'If a department is consistently underperforming, review their task assignments and team capacity.',
        ],
      },
    ],
  },

  // ── Workflow ───────────────────────────────────────────────────────────────────
  '/workflow': {
    page: 'Workflow Builder',
    intro: 'Create and manage cross-department projects where multiple teams work together on a single goal.',
    sections: [
      {
        title: 'What is a Workflow?',
        steps: [
          'A Workflow is a top-level project that spans multiple departments.',
          'Example: Launching a new product involves Marketing (ads), Operations (sourcing), R&D (formulation), and Marketplace (listing).',
          'Each department gets subtasks assigned to their team members.',
        ],
      },
      {
        title: 'Creating a new workflow',
        steps: [
          'Click "New Workflow" and give it a clear project title.',
          'Set the overall deadline and priority.',
          'Add department subtasks — one for each team involved.',
          'Assign each subtask to the relevant department manager.',
        ],
      },
      {
        title: 'Tracking progress',
        steps: [
          'The workflow list shows overall completion % for each active project.',
          'Click a workflow to open the detail view — tree or department column view.',
          'Progress updates automatically as team members complete their subtasks.',
        ],
      },
    ],
  },

  '/workflow/:taskId': {
    page: 'Workflow Detail',
    intro: 'Full view of a single cross-department project — all tasks, departments, and progress in one place.',
    sections: [
      {
        title: 'Views',
        steps: [
          'Tree View: Shows the parent task branching into department subtasks and further subtasks. Good for understanding the full hierarchy.',
          'Dept View: Shows each department as a column with their tasks. Good for day-to-day task management.',
          'Switch views using the buttons at the top right.',
        ],
      },
      {
        title: 'Managing tasks (Dept View)',
        steps: [
          'Click the + button in any department column to add a new subtask for that department.',
          'Click a task to change its status — Pending, In Progress, Completed.',
          'Drag tasks within a column to reorder by priority.',
        ],
      },
      {
        title: 'Adding subtasks',
        steps: [
          'Click the "Add Subtask" button on any task to break it down further.',
          'Assign the subtask to a specific team member.',
          'Set a deadline for the subtask — it should be before the parent task deadline.',
        ],
      },
    ],
  },

  '/dept-workflow': {
    page: 'Department Workflow',
    intro: 'Workflow view filtered to your department\'s tasks only.',
    sections: [
      {
        title: 'Using dept workflow',
        steps: [
          'Shows only the tasks assigned to your department across all active workflows.',
          'Update task status directly from this view.',
          'Add subtasks under your department\'s tasks without affecting other departments.',
        ],
      },
    ],
  },

  // ── Settings ──────────────────────────────────────────────────────────────────
  '/settings': {
    page: 'Settings',
    intro: 'Manage your profile, organization details, and notification preferences.',
    sections: [
      {
        title: 'Profile settings',
        steps: [
          'Update your name, email, or phone number.',
          'Change your password from here.',
          'Upload a profile picture by clicking the avatar.',
        ],
      },
      {
        title: 'Organization settings (Admin only)',
        steps: [
          'Update the organization name and logo.',
          'Set working hours and timezone.',
          'Manage which departments are active.',
        ],
      },
      {
        title: 'Notifications',
        steps: [
          'Choose which events trigger notifications — task assigned, task overdue, approval needed, etc.',
          'Toggle WhatsApp notifications on/off if WhatsApp integration is set up.',
        ],
      },
    ],
  },

  '/settings/whatsapp': {
    page: 'WhatsApp Setup',
    intro: 'Connect a WhatsApp number to send automated task notifications to your team.',
    sections: [
      {
        title: 'Connecting WhatsApp',
        steps: [
          'A QR code is displayed on this page.',
          'Open WhatsApp on your phone → tap the 3 dots (menu) → Linked Devices → Link a Device.',
          'Scan the QR code shown on the screen.',
          'Once scanned, the status changes to Connected — notifications are now active.',
        ],
      },
      {
        title: 'What notifications are sent',
        steps: [
          'New task assigned → sent to the assignee.',
          'Task overdue → sent to the assignee and their manager.',
          'Approval request → sent to the manager.',
          'Task approved or reopened → sent to the employee.',
        ],
      },
      {
        title: 'Disconnecting',
        steps: [
          'Click Disconnect on this page, or unlink the device from your WhatsApp phone.',
          'Notifications stop immediately after disconnecting.',
        ],
      },
    ],
  },

  // ── Auth / Onboarding ─────────────────────────────────────────────────────────
  '/onboarding': {
    page: 'Onboarding',
    intro: 'First-time setup for your organization.',
    sections: [
      {
        title: 'Completing onboarding',
        steps: [
          'Fill in your organization details — name, industry, team size.',
          'Add your first team members — you can add more later from Team Management.',
          'Choose which departments are active for your business.',
          'Click Finish to enter the app — your dashboard is ready.',
        ],
      },
    ],
  },
};

export default HELP;
