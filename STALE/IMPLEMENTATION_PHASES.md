# EDGEFOLIO - Implementation Phase Plan
**Project:** EDGEFOLIO v1.0.0 | **By:** Jenix | **Date:** April 2026

---

## 📋 Project Overview & Objectives

**EDGEFOLIO** is an offline-first, edge-computing payroll and attendance management system for SMEs and factories in India. The implementation is divided into **3 major phases** with clear deliverables, dependencies, and integration points.

### Architecture Layers
```
Phase 1: Frontend UI/UX (Standalone Components)
         ↓
Phase 2: Backend Integration (Edge Node - SQLite + Node.js)
         ↓
Phase 3: VPS Integration (Cloud Sync + Monitoring)
```

---

## 🎯 Phase 1: Frontend UI/UX Design & Component Library (Weeks 1-4)

### 🎨 Objectives
- Build a **stunning, modern UI** using React 18 + Tailwind CSS + shadcn/ui
- Create **component-first architecture** with reusable, documented components
- Design with **mock data** (no backend connection yet)
- Establish design system (colors, typography, spacing, icons)
- Create all page layouts and user flows
- Build responsive desktop + mobile-web preview

### 📂 Deliverables

#### 1.1 Design System Foundation
- **Colors:** Dark mode optimized, accessibility-compliant (WCAG AA)
- **Typography:** Readable hierarchy with Inter/Poppins fonts
- **Spacing:** 8px grid system (4px, 8px, 12px, 16px, 24px, 32px)
- **Components:** Button, Input, Select, Modal, Card, Table, Chart, Avatar, Badge
- **Icons:** Lucide React (consistent icon library)
- **Animations:** Smooth transitions, micro-interactions

#### 1.2 Page Layouts (10 pages)

| # | Page | Priority | Features |
|---|---|---|---|
| 1 | **Login** | P0 | Password input, master admin setup, remember me |
| 2 | **Dashboard** | P0 | KPIs, quick stats, today's attendance, payroll status |
| 3 | **Attendance** | P0 | Live check-in/out, daily register, face enrollment UI |
| 4 | **Employees** | P0 | CRUD operations, bulk import, filters, search |
| 5 | **Payroll** | P0 | Salary computation UI, payslip preview, bulk processing |
| 6 | **Reports** | P1 | Report builder, filters, export buttons |
| 7 | **Leave Management** | P1 | Leave requests, approvals, balance ledger |
| 8 | **Settings** | P1 | Shifts, holidays, deductions, company info |
| 9 | **Cashbook** | P2 | Expense entries, categorization, summaries |
| 10 | **Backup & Sync** | P2 | Backup status, restore options, sync info |

#### 1.3 Component Library (~50 components)

**Atomic Components:**
- Buttons (Primary, Secondary, Tertiary, Danger)
- Inputs (Text, Email, Password, Number, Date, Time)
- Select & Multi-select Dropdowns
- Checkboxes & Radio Buttons
- Toggle Switches
- Badges & Tags
- Avatars (with initials, images, status indicators)
- Progress Bars & Circles
- Spinners & Skeletons
- Tooltips & Popovers
- Alerts & Notifications
- Modals & Dialogs
- Cards (with variations)
- Tables (with sorting, pagination, inline actions)
- Tabs & Accordion
- Breadcrumbs
- Sidebar Navigation
- Top Navigation Bar
- Search Bar with Autocomplete
- Date Picker & Time Picker
- File Upload Dropzone
- Charts (Line, Bar, Pie, Donut)
- Stat Cards (with trends)

**Composite Components:**
- Employee Form (with validation)
- Attendance Register Table
- Payroll Summary Card
- Leave Request Form
- Report Builder
- Settings Panel
- Authorization Gate (role-based rendering)

#### 1.4 Mock Data Structure
```typescript
// Mock employees
const mockEmployees = [
  { id: 'EMP-001', name: 'Ramesh Kumar', dept: 'Production', salary: 18000, ... },
  { id: 'EMP-002', name: 'Priya Singh', dept: 'Admin', salary: 25000, ... },
  // ... 20+ more
]

// Mock attendance
const mockAttendance = [
  { eventId: 'EVT-001', memberId: 'EMP-001', date: '2024-04-23', checkIn: '09:00', checkOut: '18:30', ... },
  // ... more records
]

// Mock payroll
const mockPayroll = [
  { runId: 'PAY-2024-04', month: 'April 2024', totalGross: 500000, totalNet: 435000, ... },
]
```

### 📁 Folder Structure (Phase 1)

```
frontend/
├── src/
│   ├── components/              # Reusable components
│   │   ├── atomic/             # Basic components
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Table.jsx
│   │   │   ├── Avatar.jsx
│   │   │   └── ... (30+ more)
│   │   │
│   │   ├── composite/          # Combination components
│   │   │   ├── EmployeeForm.jsx
│   │   │   ├── AttendanceRegister.jsx
│   │   │   ├── PayrollCard.jsx
│   │   │   ├── LeaveRequestForm.jsx
│   │   │   └── ... (more)
│   │   │
│   │   ├── layout/             # Page layouts
│   │   │   ├── MainLayout.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── TopNav.jsx
│   │   │   └── AuthLayout.jsx
│   │   │
│   │   └── common/             # Shared UI
│   │       ├── Header.jsx
│   │       ├── Footer.jsx
│   │       └── Breadcrumb.jsx
│   │
│   ├── pages/                  # Page components
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Attendance.jsx
│   │   ├── Employees.jsx
│   │   ├── Payroll.jsx
│   │   ├── Reports.jsx
│   │   ├── LeaveManagement.jsx
│   │   ├── Settings.jsx
│   │   ├── Cashbook.jsx
│   │   └── BackupSync.jsx
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAuth.js
│   │   ├── useForm.js
│   │   ├── useTable.js
│   │   └── usePagination.js
│   │
│   ├── context/                # React Context
│   │   ├── AuthContext.jsx
│   │   ├── ThemeContext.jsx
│   │   └── MockDataContext.jsx
│   │
│   ├── styles/                 # Global styles
│   │   ├── globals.css
│   │   ├── colors.css
│   │   └── animations.css
│   │
│   ├── utils/                  # Helpers
│   │   ├── constants.js
│   │   ├── mockData.js
│   │   ├── formatters.js
│   │   └── validators.js
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── vite.config.js
└── package.json
```

### 🎨 Design System Tokens

**Colors:**
```css
/* Primary */
--color-primary-50: #f0f9ff
--color-primary-500: #0ea5e9
--color-primary-900: #0c2d4a

/* Semantic */
--color-success: #10b981
--color-warning: #f59e0b
--color-danger: #ef4444
--color-info: #3b82f6

/* Neutral */
--color-gray-50: #f9fafb
--color-gray-900: #111827
```

**Typography:**
```css
/* Headings */
--text-h1: 2.5rem / 700
--text-h2: 2rem / 700
--text-h3: 1.5rem / 600

/* Body */
--text-body-lg: 1.125rem / 400
--text-body-md: 1rem / 400
--text-body-sm: 0.875rem / 400
```

### 📊 Wireframes & User Flows

**Login Flow:**
```
Start → Enter Password → Verify (2FA optional) → Dashboard
```

**Attendance Check-in Flow:**
```
Dashboard → Attendance → Face Recognition OR Biometric ID
→ Confirm Time → Success Message
```

**Payroll Processing Flow:**
```
Dashboard → Payroll → Select Month → Compute Salary
→ Review Summary → Approve → Generate Payslips
```

### ✅ Acceptance Criteria (Phase 1)

- [ ] All 10 pages fully designed and responsive
- [ ] 50+ reusable components with Storybook documentation
- [ ] Component library exported as shared npm package (optional)
- [ ] Dark mode toggle working
- [ ] Mock data integrated across all pages
- [ ] No console errors or warnings
- [ ] Lighthouse score: >90 (Performance, Accessibility, Best Practices)
- [ ] Figma design file exported and documented
- [ ] Ready for Phase 2 backend integration

---

## 🔗 Phase 2: Backend Integration & Business Logic (Weeks 5-10)

### 🎯 Objectives
- Connect frontend to EDGE backend (Node.js + SQLite)
- Implement all API endpoints
- Add authentication (JWT + password hashing)
- Integrate database operations
- Add offline capability (service workers)
- Error handling and validation

### 📋 Tasks

#### 2.1 Backend API Development
- [ ] Setup Express server with CORS
- [ ] Create SQLite database schema
- [ ] Implement 50+ REST endpoints
- [ ] Add JWT authentication
- [ ] Add input validation middleware
- [ ] Error handling layer
- [ ] Logging system

#### 2.2 Frontend Integration
- [ ] Replace mock data with API calls
- [ ] Add React Query for data fetching
- [ ] Implement loading states & error boundaries
- [ ] Add retry logic & offline detection
- [ ] Implement file uploads
- [ ] Add real-time notifications

#### 2.3 Features to Implement
- Employee CRUD with face recognition
- Real-time attendance check-in/out
- Payroll computation engine
- Leave management workflows
- Report generation & export
- Backup & restore functionality

#### 2.4 Testing
- Unit tests (jest + React Testing Library)
- Integration tests
- API tests (supertest)
- E2E tests (Playwright)

### 📁 Folder Structure (Phase 2 - Backend)

```
backend/
├── server.js
├── config/
│   ├── database.js
│   ├── app.js
│   └── env.js
├── db/
│   ├── schema.sql
│   └── migrations/
├── routes/
│   ├── auth.js
│   ├── attendance.js
│   ├── employees.js
│   ├── payroll.js
│   └── ...
├── controllers/
│   ├── authController.js
│   ├── attendanceController.js
│   └── ...
├── models/
│   ├── Employee.js
│   ├── Attendance.js
│   └── ...
├── middleware/
│   ├── auth.js
│   ├── errorHandler.js
│   └── validators.js
├── services/
│   ├── payrollEngine.js
│   ├── reportService.js
│   └── ...
├── utils/
│   ├── logger.js
│   ├── encryption.js
│   └── validators.js
└── tests/
    ├── unit/
    └── integration/
```

### ✅ Acceptance Criteria (Phase 2)

- [ ] All 50+ API endpoints working
- [ ] Frontend fully connected to backend
- [ ] Authentication working (login/logout)
- [ ] All CRUD operations tested
- [ ] Payroll computation accurate
- [ ] Error handling comprehensive
- [ ] Unit test coverage >80%
- [ ] API documentation complete
- [ ] Offline mode working
- [ ] Ready for Phase 3 VPS integration

---

## ☁️ Phase 3: VPS Integration & Cloud Features (Weeks 11-16)

### 🎯 Objectives
- Setup VPS infrastructure (MongoDB, FRP tunnel)
- Implement data sync mechanism
- Add cloud backup functionality
- Create monitoring dashboard
- Implement billing system
- OTA update mechanism

### 📋 Tasks

#### 3.1 VPS Backend Development
- [ ] Setup Express server on VPS
- [ ] MongoDB schema & migrations
- [ ] FRP tunnel configuration
- [ ] Heartbeat monitoring system
- [ ] Backup storage & retrieval
- [ ] Billing engine (Razorpay integration)

#### 3.2 Frontend VPS Features
- [ ] Monitoring dashboard
- [ ] Backup management UI
- [ ] Subscription management
- [ ] OTA update notifications
- [ ] Multi-org support (for resellers)

#### 3.3 Integration Tasks
- [ ] Edge ↔ VPS sync mechanism (delta sync)
- [ ] FRP tunnel setup from frontend
- [ ] SSL certificate handling
- [ ] Data encryption for transmission
- [ ] Heartbeat monitoring from Edge

#### 3.4 Testing & Deployment
- [ ] Load testing for sync
- [ ] Disaster recovery testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] Production deployment

### 📁 Folder Structure (Phase 3 - VPS)

```
VPS/
├── src/
│   ├── controllers/
│   │   ├── monitoringController.js
│   │   ├── backupController.js
│   │   ├── billingController.js
│   │   └── ...
│   ├── models/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   └── utils/
├── config/
│   ├── frp-config.ini
│   ├── mongodb-config.js
│   └── pm2-config.js
├── migrations/
└── tests/
```

### ✅ Acceptance Criteria (Phase 3)

- [ ] VPS monitoring dashboard live
- [ ] Data sync working (Edge ↔ VPS)
- [ ] Backup system functional
- [ ] Billing calculations accurate
- [ ] OTA updates working
- [ ] FRP tunnel stable
- [ ] Email notifications working
- [ ] API rate limiting in place
- [ ] Load testing passed (1000 concurrent users)
- [ ] Security audit passed
- [ ] Ready for production launch

---

## 📅 Timeline Overview

```
Week 1-4:   Phase 1 - UI/UX Design & Components (4 weeks)
Week 5-10:  Phase 2 - Backend Integration (6 weeks)
Week 11-16: Phase 3 - VPS Integration (6 weeks)
Week 17+:   Testing, Bug Fixes, Production Deployment

Total: ~16 weeks (4 months)
```

### Parallel Work
- **Week 5-6:** Backend development starts while Phase 1 finalizes
- **Week 9-11:** VPS setup begins while Phase 2 backend completes
- **Week 14+:** Parallel testing of all 3 phases

---

## 🔄 Dependency Chain

```
Phase 1 (Frontend UI) ← STANDALONE (can be done independently)
         ↓
Phase 2 (Backend) ← Requires Phase 1 UI design finalized
         ↓
Phase 3 (VPS) ← Requires Phase 2 backend API contracts defined
```

---

## 🎯 Key Milestones

| Milestone | End of Week | Status |
|---|---|---|
| M1: Component Library Complete | 2 | ⏳ Pending |
| M2: All Pages Responsive & Designed | 4 | ⏳ Pending |
| M3: Backend API Endpoints Ready | 10 | ⏳ Pending |
| M4: Frontend-Backend Integration Done | 10 | ⏳ Pending |
| M5: VPS Infrastructure Setup | 12 | ⏳ Pending |
| M6: Data Sync Mechanism Working | 14 | ⏳ Pending |
| M7: Beta Testing Begins | 15 | ⏳ Pending |
| M8: Production Launch | 17 | ⏳ Pending |

---

## 📊 Success Metrics

### Phase 1 Metrics
- UI/UX component library fully documented
- Lighthouse scores >90
- Responsive on all screen sizes (mobile, tablet, desktop)
- Zero accessibility violations (WCAG AA)

### Phase 2 Metrics
- API response time <200ms
- Zero downtime after launch
- Unit test coverage >80%
- All critical business logic tested

### Phase 3 Metrics
- Edge-VPS sync latency <1 second
- 99.9% uptime for VPS
- Data integrity verified
- Backup restoration <5 minutes

---

## 🚀 Next Steps

**Week 1 Actions:**
1. ✅ Finalize design system colors & typography
2. ✅ Create component storybook
3. ✅ Design all 10 page wireframes
4. ✅ Setup Vite + React + Tailwind + shadcn/ui
5. ✅ Build atomic components library
6. ✅ Start building page layouts

**Parallel Actions:**
1. Setup backend repository structure
2. Design database schema
3. Setup VPS infrastructure
4. Plan API contracts

---

**Document Version:** 1.0  
**Last Updated:** April 2026  
**Status:** PLANNING PHASE ✅  
**Next Review:** When Phase 1 starts
