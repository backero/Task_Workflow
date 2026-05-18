# Backero — Enterprise Multi-Department Workflow Platform

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- npm or yarn

### Backend Setup

```bash
cd backero-backend
npm install
cp .env.example .env
# Fill in your MongoDB URI, JWT secrets, and other values in .env
npm run dev
# Server starts on http://localhost:5000
```

### Frontend Setup

```bash
cd backero-frontend
npm install
# Create .env.local with:
# VITE_API_URL=http://localhost:5000/api
npm run dev
# App starts on http://localhost:5173
```

---

## Project Structure

```
backero-backend/
├── server.js                    # Entry point
├── src/
│   ├── config/                  # DB, Socket.io config
│   ├── models/                  # MongoDB models
│   │   ├── User.js
│   │   ├── Organization.js
│   │   ├── Task.js
│   │   ├── TaskApproval.js      # Approval workflow
│   │   ├── Lead.js              # CRM leads
│   │   ├── Product.js           # Inventory
│   │   ├── StockMovement.js
│   │   ├── ProductionOrder.js
│   │   ├── Transaction.js       # Finance
│   │   ├── Invoice.js
│   │   ├── Notification.js
│   │   ├── ActivityLog.js
│   │   ├── Campaign.js          # Marketing
│   │   └── Department.js
│   ├── middleware/
│   │   ├── auth.middleware.js   # JWT auth
│   │   ├── orgIsolation.middleware.js  # Multi-tenant isolation
│   │   ├── role.middleware.js   # RBAC
│   │   ├── errorHandler.middleware.js
│   │   └── validate.middleware.js
│   ├── controllers/             # Business logic
│   ├── routes/                  # API routes
│   ├── services/
│   │   ├── automation.service.js   # Cron automation engine
│   │   ├── notification.service.js # In-app + WhatsApp
│   │   ├── whatsapp.service.js     # Baileys integration
│   │   └── googleSheets.service.js # Lead sync
│   └── utils/
│       ├── constants.js         # All enums/constants
│       ├── helpers.js           # Utility functions
│       └── logger.js            # Winston logger

backero-frontend/
├── src/
│   ├── api/axios.js             # Axios + auto token refresh
│   ├── store/                   # Zustand state management
│   │   ├── useAuthStore.js
│   │   ├── useSocketStore.js    # Real-time Socket.io
│   │   └── useNotificationStore.js
│   ├── components/
│   │   ├── layout/              # Layout, Sidebar, Header
│   │   └── common/              # Shared components
│   └── pages/
│       ├── auth/                # Login, Register, Onboarding
│       ├── dashboard/           # Founder, Manager, Employee
│       ├── tasks/               # Kanban, MyTasks, Approvals
│       ├── crm/                 # Lead Pipeline, Details
│       ├── inventory/           # Products, Movements, Alerts
│       ├── production/          # Orders, QC, Batches
│       ├── finance/             # Ledger, Invoices, Reports
│       ├── departments/         # Marketing, Marketplace, Sales, R&D
│       ├── management/          # Employee Monitoring, Dept Analytics
│       └── settings/            # Profile & Preferences
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register org + first admin
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user

### Tasks
- `GET /api/tasks` — List tasks (filtered by role)
- `POST /api/tasks` — Create task (managers+)
- `PUT /api/tasks/:id` — Update task
- `POST /api/tasks/:id/request-completion` — Employee submits for review
- `POST /api/tasks/:id/comment` — Add comment
- `GET /api/tasks/analytics` — Task analytics

### Approvals
- `GET /api/approvals` — Pending approvals queue
- `POST /api/approvals/:id/approve` — Approve task
- `POST /api/approvals/:id/reject` — Reject with reason
- `GET /api/approvals/stats` — Approval statistics

### CRM
- `GET /api/crm/leads` — List leads
- `POST /api/crm/leads` — Create lead
- `GET /api/crm/leads/pipeline` — Kanban pipeline
- `POST /api/crm/leads/:id/followup` — Record follow-up
- `POST /api/crm/leads/:id/convert-to-task` — Convert to task

### Inventory
- `GET /api/inventory/products` — Product list
- `POST /api/inventory/stock-in` — Add stock
- `POST /api/inventory/stock-out` — Deduct stock
- `GET /api/inventory/alerts` — Low stock alerts

### Production
- `GET /api/production` — Orders list
- `POST /api/production` — Create order
- `PATCH /api/production/:id/status` — Update status (auto-manages inventory)

### Finance
- `GET /api/finance/transactions` — Transaction ledger
- `POST /api/finance/transactions` — Record transaction
- `GET /api/finance/summary` — P&L summary
- `GET /api/finance/invoices` — Invoices list
- `POST /api/finance/invoices` — Create invoice

### Dashboards
- `GET /api/dashboard/founder` — Founder command center
- `GET /api/dashboard/manager` — Manager overview
- `GET /api/dashboard/employee` — Employee workspace

---

## Key Features Implemented

### Multi-Tenant Architecture
- Every model has `organizationId`
- `orgIsolation.middleware.js` enforces org-scoped queries
- Zero cross-org data leakage

### Task Approval Workflow
```
Assigned → In Progress → Request Completion → Approval Pending
                                                    ↓
                              Approved (Completed) OR Rejected (Changes Requested)
```
- Employees CANNOT mark tasks complete
- Only managers+ can approve/reject
- Full audit trail in `TaskApproval` model

### Automation Engine (cron-based)
- **Every 30 min**: Check overdue tasks → notify employee + manager
- **Every 60 min**: Check stale leads (48h no contact) → remind salesperson
- **Every 6 hours**: Low stock check → alert admins
- **Daily 9 AM IST**: Company summary to Founders
- **Weekly Monday**: Department performance reports
- **Escalation**: Critical tasks overdue 3+ times → notify Founder/Chairman

### Real-Time (Socket.io)
- Rooms: `user:id`, `org:id`, `department:id`, `task:id`
- Events: task_created, task_updated, task_approved, task_rejected, inventory_low, overdue_alert, invoice_paid

### Role-Based Access
```
super_admin (7) > chairman (6) > founder (5) > admin (4) > manager (3) > team_lead (2) > member (1)
```

---

## Environment Variables (.env)

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

---

## Deployment

### Backend → Render
1. Connect GitHub repo
2. Set environment variables
3. Build: `npm install`
4. Start: `node server.js`

### Frontend → Vercel
1. Connect GitHub repo
2. Set `VITE_API_URL=https://your-render-url/api`
3. Framework: Vite

### Database → MongoDB Atlas
1. Create M0 (free) cluster
2. Add connection string to `MONGODB_URI`
3. Allow Render's IP in Network Access

---

## Next Development Phases

1. **WhatsApp Integration** — Wire up Baileys in `whatsapp.service.js`
2. **Google Sheets Sync** — Add sync endpoint in CRM routes
3. **PDF Reports** — Wire PDFKit in report service
4. **Excel Export** — Wire ExcelJS in report service
5. **File Uploads** — Wire Multer + Cloudinary for task attachments
6. **AI Analytics** — Add OpenAI/Claude API integration
7. **Mobile App** — React Native frontend consuming same API
