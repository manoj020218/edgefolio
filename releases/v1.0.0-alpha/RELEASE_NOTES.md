# EDGEFOLIO v1.0.0-alpha

**Release Date:** April 27, 2026  
**Phase:** 1 of 3 (Frontend UI/UX)  
**Status:** Alpha — UI complete, backend integration in progress

---

## What's in this release

### UI & Design System
- Complete dark-mode design system with 100+ design tokens
- Primary palette: Sky Blue (#0ea5e9) on Slate-900 backgrounds
- Inter + JetBrains Mono typefaces
- Fully responsive layout (mobile, tablet, desktop)
- Collapsible sidebar navigation

### Pages (10/10 complete)
- **Login** — Email/password, 2FA verification flow, demo credentials
- **Dashboard** — KPI cards, today's attendance table, payroll status, quick actions
- **Attendance** — Check-in/out simulation, face recognition UI, daily register, filters
- **Employees** — CRUD form, searchable table, department filters, mock data
- **Payroll** — Monthly computation UI, payslip preview, bulk processing
- **Reports** — Report builder with filters, export buttons
- **Leave Management** — Leave requests, approval workflow, balance ledger
- **Settings** — Shifts, holidays, deductions, company info
- **Cashbook** — Expense entries, categorization, summaries
- **Backup & Sync** — Backup status, sync controls, encryption info

### Component Library (15+ atomic components)
- Button (4 variants, 5 sizes)
- Input (text, email, password, icons, validation)
- Card, Modal, Table, Badge, Avatar, Alert, Spinner, EmptyState, Select

### Mock Data
- 20+ realistic employees (Indian names, departments, salaries)
- Attendance records with check-in/out times, statuses
- Payroll runs with deductions (PF, ESI, PT)
- Leave requests and approvals

---

## How to run

```bash
# 1. Clone the repository
git clone https://github.com/manoj020218/edgefolio.git
cd edgefolio

# 2. Install dependencies
cd EDGE/frontend
npm install

# 3. Start development server
npm run dev

# 4. Open browser
# Navigate to: http://localhost:5173
# Login: admin@edgefolio.com / password
# 2FA code: 123456
```

**Requirements:**
- Node.js 18 or higher
- Windows 10/11 (also works on macOS/Linux)

---

## Known limitations (Alpha)

- No real backend — all data is mock/in-memory
- No persistence between page refreshes
- Face recognition is UI-only (no actual camera integration yet)
- Payroll calculations are simulated

---

## What's next (v1.1.0-beta)

- SQLite database backend (Node.js + Express)
- Real authentication (JWT)
- Employee CRUD persisted to database
- Real attendance check-in/out
- Payroll computation engine

---

## Checksums

| File | SHA-256 |
|---|---|
| edgefolio-v1.0.0-alpha.zip | *(generated on GitHub release)* |

---

**Repository:** https://github.com/manoj020218/edgefolio  
**Issues:** https://github.com/manoj020218/edgefolio/issues  
**License:** MIT
