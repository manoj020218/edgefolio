# EDGEFOLIO Frontend - Component-First Design System
**Phase 1: UI/UX Design & Component Library**  
**Status:** In Development | **Last Updated:** April 2026

---

## 🎨 Project Overview

This is a **stunning, modern, component-first** frontend for EDGEFOLIO using:
- **React 18** - UI framework
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library
- **Vite** - Lightning-fast bundler
- **Mock Data** - No backend connection yet (Phase 1)

### Design Philosophy
- **Dark Mode First** - Better for office environments
- **Accessibility** - WCAG AA compliance
- **Performance** - <3s load time, <100ms interactions
- **Responsive** - Mobile, tablet, desktop
- **Component-Driven** - Reusable, documented, tested

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/                    # Component Library
│   │   ├── atomic/
│   │   │   └── index.jsx             # 15+ atomic components
│   │   │       ├── Button.jsx
│   │   │       ├── Input.jsx
│   │   │       ├── Select.jsx
│   │   │       ├── Modal.jsx
│   │   │       ├── Card.jsx
│   │   │       ├── Table.jsx
│   │   │       ├── Badge.jsx
│   │   │       ├── Avatar.jsx
│   │   │       ├── Alert.jsx
│   │   │       ├── Spinner.jsx
│   │   │       ├── EmptyState.jsx
│   │   │       └── ... (more components)
│   │   │
│   │   ├── composite/
│   │   │   ├── Sidebar.jsx           # Left navigation
│   │   │   ├── TopNav.jsx            # Header bar
│   │   │   ├── EmployeeForm.jsx      # Employee CRUD form
│   │   │   ├── AttendanceRegister.jsx # Attendance table
│   │   │   ├── PayrollCard.jsx       # Payroll summary
│   │   │   └── LeaveRequestForm.jsx  # Leave form
│   │   │
│   │   ├── layout/
│   │   │   ├── MainLayout.jsx        # Main app layout
│   │   │   ├── AuthLayout.jsx        # Login layout
│   │   │   └── DashboardLayout.jsx   # Dashboard container
│   │   │
│   │   └── common/
│   │       ├── Header.jsx
│   │       ├── Footer.jsx
│   │       └── Breadcrumb.jsx
│   │
│   ├── pages/                        # Page Components
│   │   ├── LoginPage.jsx             # ✅ Authentication
│   │   ├── DashboardPage.jsx         # ✅ Main dashboard
│   │   ├── AttendancePage.jsx        # Attendance management
│   │   ├── EmployeesPage.jsx         # Employee CRUD
│   │   ├── PayrollPage.jsx           # Payroll processing
│   │   ├── ReportsPage.jsx           # Report builder
│   │   ├── LeaveManagementPage.jsx   # Leave requests
│   │   ├── SettingsPage.jsx          # Configuration
│   │   ├── CashbookPage.jsx          # Expense tracking
│   │   └── BackupSyncPage.jsx        # Backup status
│   │
│   ├── hooks/                        # Custom Hooks
│   │   ├── useAuth.js                # Auth state
│   │   ├── useForm.js                # Form handling
│   │   ├── useTable.js               # Table logic
│   │   ├── usePagination.js          # Pagination
│   │   └── useMockData.js            # Mock data fetching
│   │
│   ├── context/                      # React Context
│   │   ├── AuthContext.jsx           # Auth state management
│   │   ├── ThemeContext.jsx          # Dark/light mode
│   │   └── MockDataContext.jsx       # Global mock data
│   │
│   ├── theme/                        # Design System
│   │   ├── designSystem.js           # ✅ Colors, typography, spacing
│   │   ├── globals.css               # Global styles
│   │   ├── colors.css                # Color definitions
│   │   └── animations.css            # Animations
│   │
│   ├── utils/                        # Utilities
│   │   ├── constants.js              # Constants & config
│   │   ├── mockData.js               # Mock data generators
│   │   ├── formatters.js             # Date, currency formatters
│   │   ├── validators.js             # Input validation
│   │   └── helpers.js                # Helper functions
│   │
│   ├── App.jsx                       # Root component
│   ├── main.jsx                      # Entry point
│   └── index.css                     # Tailwind imports
│
├── public/                           # Static assets
│   ├── index.html
│   ├── favicon.ico
│   └── logo.svg
│
├── .env.example                      # Environment variables
├── vite.config.js                    # Vite configuration
├── tailwind.config.js                # Tailwind configuration
├── postcss.config.js                 # PostCSS configuration
├── package.json                      # Dependencies
└── README.md                         # This file
```

---

## 🚀 Quick Start

### Prerequisites
```bash
Node.js 18+ 
npm 9+ or yarn 3+
```

### Installation

```bash
# Clone and navigate
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development Server
```bash
# Start with hot module replacement
npm run dev
# Open http://localhost:5173
```

---

## 🎨 Design System

### Colors
```javascript
// Primary: Sky Blue
primary-500: #0ea5e9
primary-900: #0c2d4a

// Semantic
success: #10b981
warning: #f59e0b
danger: #ef4444
info: #3b82f6

// Backgrounds (Dark Mode)
background: #0f172a (slate-900)
surface: #1e293b (slate-800)
text: #f1f5f9 (slate-100)
```

### Typography
- **Font Family:** Inter (sans), JetBrains Mono (mono)
- **Headings:** H1 (2.5rem/700), H2 (2rem/700), H3 (1.5rem/600)
- **Body:** lg (1.125rem), md (1rem), sm (0.875rem)

### Spacing
- **8px Grid System:** 0, 4px, 8px, 12px, 16px, 24px, 32px...
- **Usage:** Consistent padding, margins, gaps

### Components Implemented ✅

#### Atomic Components (15+)
- ✅ **Button** - 4 variants (primary, secondary, tertiary, danger)
- ✅ **Input** - Text, email, password, with icons
- ✅ **Select** - Dropdown with custom styling
- ✅ **Card** - Container with optional header/footer
- ✅ **Table** - Sortable with pagination
- ✅ **Badge** - 5 semantic variants
- ✅ **Avatar** - With initials, images, status indicator
- ✅ **Modal** - Dialog with form support
- ✅ **Alert** - 4 variants (info, success, warning, danger)
- ✅ **Spinner** - Loading indicator
- ✅ **EmptyState** - No data placeholder
- ✅ (more coming...)

#### Composite Components (In Development)
- ⏳ Sidebar navigation
- ⏳ Top navigation bar
- ⏳ Employee form
- ⏳ Attendance register
- ⏳ Payroll card

---

## 📄 Pages (Phase 1)

### ✅ Completed Pages

#### 1. **Login Page** (`LoginPage.jsx`)
- Beautiful authentication UI
- Email & password input
- 2FA verification (demo)
- Remember me checkbox
- Demo credentials: admin@edgefolio.com / password
- Error handling & validation

**Features:**
- Form validation
- Loading states
- Two-factor authentication flow
- Demo mode access
- Responsive design

#### 2. **Dashboard** (`DashboardPage.jsx`)
- 4 KPI cards with trends
- Today's attendance register (5 employees shown)
- Payroll status (last 3 months)
- Quick action buttons
- System status indicator
- Attendance trend chart (placeholder)

**Components Used:**
- KPI Card (custom)
- Stat Cards
- Tables
- Badges
- Alerts
- Cards

### 📋 Pages In Development (Phase 1 - Weeks 2-4)

| # | Page | Status | Features |
|---|---|---|---|
| 3 | **Attendance** | ⏳ | Check-in/out, face recognition UI, daily register, filters |
| 4 | **Employees** | ⏳ | CRUD operations, bulk import, filters, search, avatar |
| 5 | **Payroll** | ⏳ | Salary computation UI, payslip preview, bulk processing |
| 6 | **Reports** | ⏳ | Report builder, filters, export buttons (Excel, PDF) |
| 7 | **Leaves** | ⏳ | Leave requests, approvals, balance ledger, calendar |
| 8 | **Settings** | ⏳ | Shifts, holidays, company info, deductions |
| 9 | **Cashbook** | ⏳ | Expense entries, categorization, summaries |
| 10 | **Backup** | ⏳ | Backup status, restore options, sync info |

---

## 🧩 Component Usage Examples

### Button
```jsx
<Button variant="primary" size="md">
  Click me
</Button>

<Button icon={Download} iconPosition="right" isLoading={isLoading}>
  Export
</Button>

<Button variant="danger" isFullWidth>
  Delete
</Button>
```

### Input
```jsx
<Input
  type="email"
  label="Email Address"
  placeholder="user@example.com"
  icon={Mail}
  helperText="We'll never share your email"
  isError={hasError}
/>
```

### Table
```jsx
<Table
  columns={[
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status', render: (value) => <Badge>{value}</Badge> }
  ]}
  data={employees}
  isStriped={true}
  isHoverable={true}
/>
```

### Card
```jsx
<Card
  header={<h2>Employee Details</h2>}
  footer={<Button>Save</Button>}
>
  <p>Card content here</p>
</Card>
```

### Modal
```jsx
const [isOpen, setIsOpen] = useState(false);

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Delete"
  size="md"
>
  <p>Are you sure?</p>
</Modal>
```

---

## 🎯 Mock Data Integration

All pages use **mock data** from `utils/mockData.js`:

```javascript
// Mock employees
const mockEmployees = [
  { id: 'EMP-001', name: 'Ramesh Kumar', dept: 'Production', ... },
  // ... 20+ more
]

// Mock attendance
const mockAttendance = [
  { eventId: 'EVT-001', memberId: 'EMP-001', date: '2024-04-23', ... },
  // ... more records
]

// Mock payroll
const mockPayroll = [
  { runId: 'PAY-2024-04', month: 'April 2024', ... },
]
```

**Usage in pages:**
```jsx
import { mockEmployees, mockAttendance } from '../utils/mockData';

export const EmployeesPage = () => {
  const [employees, setEmployees] = useState(mockEmployees);
  // ...
}
```

---

## 🔗 Routing (Phase 1)

```javascript
// routes/index.js
const routes = [
  { path: '/login', component: LoginPage, isPublic: true },
  { path: '/dashboard', component: DashboardPage, isProtected: true },
  { path: '/attendance', component: AttendancePage, isProtected: true },
  { path: '/employees', component: EmployeesPage, isProtected: true },
  { path: '/payroll', component: PayrollPage, isProtected: true },
  { path: '/reports', component: ReportsPage, isProtected: true },
  // ... more routes
];
```

---

## 📦 Dependencies

### Core
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "vite": "^4.4.0"
}
```

### Styling
```json
{
  "tailwindcss": "^3.3.0",
  "postcss": "^8.4.27",
  "autoprefixer": "^10.4.14"
}
```

### Icons & Utilities
```json
{
  "lucide-react": "^0.263.1"
}
```

### Development
```json
{
  "@vitejs/plugin-react": "^4.0.0",
  "tailwindcss-animate": "^1.0.0"
}
```

---

## ✅ Acceptance Criteria (Phase 1)

- [x] Design system fully documented
- [x] Login page completed & styled
- [x] Dashboard with KPIs completed
- [ ] 8 additional pages completed
- [ ] 50+ reusable components
- [ ] Mock data integrated
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode fully functional
- [ ] Lighthouse score >90
- [ ] Zero console errors/warnings
- [ ] Component documentation (Storybook)

---

## 🔄 Next Steps (Weeks 2-4)

1. **Week 2:** Build Attendance, Employees, Payroll pages
2. **Week 3:** Build Reports, Leaves, Settings pages
3. **Week 4:** Build Cashbook, Backup, finalize UI/polish
4. **Week 4:** Documentation, testing, Storybook setup

---

## 📊 Component Statistics

| Type | Count | Status |
|---|---|---|
| Atomic Components | 15+ | ✅ In Progress |
| Composite Components | 6+ | ⏳ Planned |
| Page Layouts | 10 | ⏳ 2/10 Complete |
| Design Tokens | 100+ | ✅ Complete |

---

## 🐛 Testing & Quality

### Lighthouse Targets
- **Performance:** >90
- **Accessibility:** >95 (WCAG AA)
- **Best Practices:** >90
- **SEO:** >90

### Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

---

## 📝 Component API Documentation

### Button Props
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isFullWidth?: boolean;
  isLoading?: boolean;
  isDisabled?: boolean;
  icon?: React.ComponentType;
  iconPosition?: 'left' | 'right';
  onClick?: () => void;
  children: React.ReactNode;
}
```

### Input Props
```typescript
interface InputProps {
  type?: string;
  size?: 'sm' | 'md' | 'lg';
  isError?: boolean;
  isDisabled?: boolean;
  icon?: React.ComponentType;
  label?: string;
  helperText?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent) => void;
}
```

---

## 🎨 Storybook Setup (Coming Soon)

```bash
# Generate component stories
npm run storybook

# Build storybook
npm run build-storybook
```

---

## 📚 Resources

- [React 18 Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Lucide Icons](https://lucide.dev)
- [Vite Guide](https://vitejs.dev)

---

## 🤝 Contributing

**For Phase 1 Development:**
1. Follow component naming conventions
2. Update this README when adding new components/pages
3. Keep mock data in `utils/mockData.js`
4. Test responsiveness on mobile/tablet
5. Run Lighthouse audit before PR

---

## 📄 License

© 2026 EDGEFOLIO by Jenix. All rights reserved.

---

**Last Updated:** April 2026  
**Phase:** 1 - UI/UX Design  
**Status:** 🟡 In Development  
**Progress:** 20% Complete (2/10 pages + Design System)
