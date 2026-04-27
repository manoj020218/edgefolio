# EDGEFOLIO - Edge Node System
**By Jenix** | Project: EDGEFOLIO | Version: 1.0.0

---

## 🎯 Project Objectives

**EDGEFOLIO** is an **offline-first, edge-computing payroll and attendance management system** designed for SMEs, factories, field teams, and retail chains across India. 

### Core Problem Statement
Traditional HR software requires constant internet connectivity, making it unsuitable for low-connectivity environments (rural factories, field operations, CG-NAT networks, etc.). EDGEFOLIO solves this by:

- **Eliminating cloud dependency:** All data lives locally on Windows edge nodes
- **Working 100% offline:** Core payroll, attendance, reporting function without internet
- **Accepting multi-source input:** Face cameras, Android apps, biometric machines, or manual entry
- **Offering optional cloud sync:** VPS provides monitoring, backups, and paid tier features
- **Ensuring data privacy:** Face templates & employee data never leave the device without consent

---

## 📋 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Face Camera │  │ Android App  │  │ Biometric Machine  │   │
│  │  (IP/USB)    │  │ (APK)        │  │ (ZKTeco / eSSL)    │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘   │
│         └─────────────────┴──────────────────── ┘             │
│                      JSON Attendance Event                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              EDGE NODE (Windows PC / Electron App)              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Node.js Backend + React Frontend               │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ Attendance │  │   Payroll    │  │  Leave / Loan   │  │  │
│  │  │  Engine    │  │   Engine     │  │   Engine        │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  Shift /   │  │  Reports     │  │  Cashbook /     │  │  │
│  │  │  Holiday   │  │  (Excel/PDF) │  │  Expenses       │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │                                                          │  │
│  │              SQLite Local Database                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Offline Mode ✅  |  Local LAN Wi-Fi for App ✅                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Optional / Paid (Via FRP Tunnel)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VPS (Cloud) - Optional                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Monitoring  │  │  APK Host /  │  │  Paid Backup       │   │
│  │  Dashboard   │  │  OTA Updates │  │  (>45 days data)   │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│           + FRP Tunnel (Reverse Proxy - No Cloudflare needed) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Features (Phase 1)

### M1 - Face Attendance Engine
- JSON attendance input from multiple sources
- Anti-ghost punch deduplication (±3 min window)
- Automatic calculations: working hours, late minutes, OT, early departure
- Shift policy rule engine

### M2 - Employee Management
- Complete employee profiles (PAN, Aadhaar, bank details)
- Department & designation management
- Salary structure configuration
- Face enrollment & biometric ID mapping

### M3 - Shift & Holiday Policy
- Multiple shift definitions (Morning/Evening/Night/Rotational)
- Rotational shift calendar management
- National holiday calendar (India auto-loaded)
- Grace period & early cut-off rules

### M4 - Leave Management
- Multiple leave types: CL, SL, PL, LWP, CompOff
- Leave balance ledger per employee per year
- Staff self-apply, manager approve/reject
- Auto-deduction from salary on LWP
- Carry-forward rules

### M5 - Salary & Payroll Engine
- Monthly/weekly/daily wage computation
- Deduction logic: LWP, Late fees, Loan EMI, Advances
- Overtime addition (1.5x / 2x configurable)
- Statutory deductions: PF, ESI, PT (configurable)
- Bulk salary processing
- Branded PDF payslip generation

### M6 - Advance & Loan Module
- Record advance payments with dates
- Repayment schedule (EMI-style deduction)
- Auto-deduction from monthly salary
- Outstanding balance tracking

### M7 - Reports Engine
- Attendance register (daily/monthly/custom range)
- Salary statements (individual + consolidated)
- Leave summary report
- Deduction report (loan, late, LWP)
- Overtime report
- Department-wise headcount
- Export: Excel, PDF, CSV

### M8 - Cashbook & Expense Tracker
- Record business expenses (petty cash)
- Categorise expenses (travel, office, maintenance, etc.)
- Link expenses to employees
- Monthly cash flow summary

### M9 - Field Salesperson Tracking
- Daily work report submission via app
- Visit log (client name, location, outcome)
- GPS stamp on report (when online)
- Manager review dashboard

### M10 - SMS & Notification Engine
- Salary credit notification
- Payslip dispatch via SMS/WhatsApp link
- Leave approval/rejection notification
- Overtime alerts
- Works when internet available; queues when offline

### M11 - Admin & Manager Access Control
- Role-based access: Super Admin, Admin, Manager, Staff
- Department-wise manager permissions
- Staff never sees other employees' data

---

## 🛠️ Tech Stack

### Edge Node (Windows PC)

| Layer | Technology | Rationale |
|---|---|---|
| **Desktop Shell** | Electron 28+ | Cross-platform, native Windows app |
| **Backend Server** | Node.js 20 LTS + Express | Local REST API on `localhost:7001` |
| **Database** | SQLite 3 (better-sqlite3) | Zero-config, file-based, offline-perfect |
| **ORM** | Drizzle ORM | Type-safe, lightweight |
| **Face Processing** | Python 3.11 + DeepFace/InsightFace | Local face recognition, no cloud API |
| **PDF Generation** | Puppeteer (headless Chrome) | Pixel-perfect branded payslips |
| **Excel Export** | ExcelJS | Rich Excel with formatting |
| **Job Queue** | Bull/node-cron | Scheduled tasks, payroll runs |
| **UI Framework** | React 18 + Vite | Fast, modern interface |
| **UI Components** | shadcn/ui + Tailwind CSS | Consistent design system |

### Android APK

| Layer | Technology |
|---|---|
| **Framework** | React Native 0.73+ |
| **Local Storage** | AsyncStorage + SQLite (expo-sqlite) |
| **Face Capture** | expo-camera + TensorFlow Lite (liveness) |
| **Auth** | Google Sign-In (GAuth) for onboarding |
| **Offline Sync** | Custom sync queue (JSON events stored locally) |

### FRP Tunnel (Reverse Proxy)

| Layer | Technology |
|---|---|
| **Tunnel Client** | FRP (frpc) on Edge node |
| **Tunnel Server** | FRP (frps) on VPS |
| **Purpose** | Secure reverse proxy - NO public IP needed |

---

## 📂 Folder Structure

```
EDGE/
├── electron/                        # Desktop app shell
│   ├── main.js                     # Electron main process
│   └── preload.js                  # IPC bridge for security
│
├── backend/                         # Express server (localhost:7001)
│   ├── server.js                   # Express setup
│   ├── index.js                    # Entry point
│   │
│   ├── controllers/                # Route handlers
│   │   ├── attendanceController.js # POST /api/attendance/event
│   │   ├── employeeController.js   # Employee CRUD
│   │   ├── payrollController.js    # Payroll computation
│   │   ├── leaveController.js      # Leave management
│   │   ├── reportController.js     # Report generation
│   │   ├── cashbookController.js   # Expense tracking
│   │   └── syncController.js       # VPS sync
│   │
│   ├── models/                     # Database schemas
│   │   ├── employee.js             # Employee table
│   │   ├── attendance.js           # Attendance events
│   │   ├── payroll.js              # Payroll runs & entries
│   │   ├── leave.js                # Leave requests
│   │   ├── shift.js                # Shift definitions
│   │   ├── loan.js                 # Loans & advances
│   │   └── cashbook.js             # Expense records
│   │
│   ├── services/                   # Business logic
│   │   ├── attendanceService.js    # Attendance computation
│   │   ├── payrollEngine.js        # Salary calculations
│   │   ├── reportService.js        # Report generation
│   │   ├── syncService.js          # VPS data sync
│   │   ├── backupService.js        # GDrive/local backup
│   │   ├── faceRecognitionService.js # Python bridge
│   │   ├── smsService.js           # SMS gateway
│   │   └── notificationService.js  # Alerts & emails
│   │
│   ├── routes/                     # API endpoints
│   │   ├── attendance.js           # GET/POST /api/attendance
│   │   ├── employees.js            # GET/POST /api/employees
│   │   ├── payroll.js              # POST /api/payroll/run
│   │   ├── reports.js              # GET /api/reports/*
│   │   ├── leaves.js               # GET/POST /api/leaves
│   │   ├── sync.js                 # POST /api/sync/*
│   │   ├── backup.js               # POST /api/backup
│   │   └── cashbook.js             # GET/POST /api/cashbook
│   │
│   ├── middleware/                 # Express middleware
│   │   ├── auth.js                 # JWT/password validation
│   │   ├── errorHandler.js         # Global error handling
│   │   └── validators.js           # Input validation
│   │
│   ├── jobs/                       # Scheduled tasks
│   │   ├── payrollScheduler.js     # Monthly payroll run
│   │   ├── backupScheduler.js      # Auto-backup (every night)
│   │   ├── syncScheduler.js        # Periodic VPS sync
│   │   └── cleanupScheduler.js     # Old logs cleanup
│   │
│   ├── utils/                      # Helper functions
│   │   ├── logger.js               # Structured logging
│   │   ├── encryption.js           # AES-256 encrypt/decrypt
│   │   ├── dateUtils.js            # Date calculations
│   │   ├── validators.js           # Schema validation
│   │   └── payrollCalculators.js   # Salary math
│   │
│   ├── config/                     # Configuration
│   │   ├── app.js                  # App config
│   │   ├── database.js             # SQLite setup
│   │   ├── frpConfig.js            # FRP tunnel config
│   │   ├── frp-client-config.ini   # FRP client ini
│   │   └── .env.example            # Environment template
│   │
│   └── migrations/                 # Database schema
│       └── sqlite-schema.sql       # SQLite DDL
│
├── frontend/                        # React web UI
│   ├── src/
│   │   ├── App.jsx                 # Root component
│   │   ├── pages/                  # Page components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Attendance.jsx
│   │   │   ├── Employees.jsx
│   │   │   ├── Payroll.jsx
│   │   │   ├── Reports.jsx
│   │   │   ├── Leave.jsx
│   │   │   ├── Cashbook.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/             # Reusable components
│   │   ├── layouts/                # Layout templates
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── context/                # Context providers
│   │   ├── styles/                 # Tailwind CSS
│   │   └── utils/                  # Frontend helpers
│   ├── public/                     # Static assets
│   ├── vite.config.js              # Vite bundler config
│   └── package.json                # Frontend dependencies
│
├── python/                         # Face recognition service
│   ├── face_recognition_service.py # DeepFace/InsightFace
│   ├── requirements.txt            # Python packages
│   └── models/                     # ML model files
│
├── mobile-app/                     # React Native Android APK
│   ├── app.json                    # Expo config
│   ├── package.json                # RN dependencies
│   └── src/                        # App source
│
├── storage/                        # Data storage
│   ├── database/                   # SQLite file
│   │   └── edgefolio.db
│   ├── backups/                    # Local .pbbackup files
│   ├── documents/                  # Uploaded documents
│   └── face-templates/             # Face embeddings (encrypted)
│
├── logs/                           # Application logs
│   ├── server.log
│   ├── sync.log
│   ├── backup.log
│   └── face-recognition.log
│
├── scripts/                        # Utility scripts
│   ├── init-database.js            # Database initialization
│   ├── generate-qr-code.js         # QR for onboarding
│   └── setup.sh                    # System setup
│
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests
│   └── integration/                # Integration tests
│
├── docs/                           # Documentation
│   ├── API-Documentation.md        # REST API reference
│   ├── Database-Schema.md          # SQLite schema
│   └── Installation-Guide.md       # Setup instructions
│
├── package.json                    # Node.js dependencies
├── .gitignore                      # Git ignore rules
└── README.md                       # This file
```

---

## 🚀 Installation & Setup

### Prerequisites

- **Windows 10/11** (for production) or **macOS/Linux** (for development)
- **Node.js 20 LTS**
- **Python 3.11** (for face recognition)
- **SQLite 3**
- **USB Camera** or **IP Camera** (for face enrollment)

### 1. Clone & Install Dependencies

```bash
cd d:\IOT Device\Salary_On\smart_salary\EdgeFolio\EDGE
npm install

# Install Python dependencies
cd python
pip install -r requirements.txt
cd ..
```

### 2. Initialize Database

```bash
npm run init-db
# Creates C:\EdgeFolio\data\edgefolio.db
```

### 3. Setup FRP Tunnel (Optional)

```bash
# Copy FRP config from VPS
cp backend/config/frp-client-config.ini .

# Configure with VPS details
# - FRP_SERVER_ADDR: Your VPS IP
# - FRP_SERVER_PORT: 7000
# - AUTH_TOKEN: Secure token from VPS
```

### 4. Start Development

```bash
# Terminal 1: Backend server
npm run server

# Terminal 2: Frontend dev server
npm run frontend

# Terminal 3: Electron app
npm run electron
```

### 5. Production Build

```bash
npm run build:electron
# Creates standalone Windows installer (.exe)
```

---

## 📡 API Endpoints (Local)

**Base URL:** `http://localhost:7001/api/v1`  
**LAN Access:** `http://192.168.x.x:7001/api/v1` (for Android app)

### Attendance

```
POST   /attendance/event              Submit single attendance event (JSON)
POST   /attendance/batch              Submit batch events
GET    /attendance/summary?date=      Daily attendance summary
GET    /attendance/member/:id?from=&to= Member history
```

### Employees

```
GET    /employees                     List all employees
POST   /employees                     Create employee
PUT    /employees/:id                 Update employee
GET    /employees/:id                 Get profile
POST   /employees/:id/enroll-face     Enroll face from camera
```

### Payroll

```
POST   /payroll/run                   Trigger monthly payroll
GET    /payroll/run/:run_id           Get payroll details
GET    /payroll/slip/:entry_id        Generate payslip PDF
POST   /payroll/approve/:run_id       Approve payroll
```

### Reports

```
GET    /reports/attendance?from=&to=&dept= Attendance register
GET    /reports/salary?month=&dept=   Salary report
GET    /reports/export/excel          Download Excel
GET    /reports/export/pdf            Download PDF
```

### Sync & Backup

```
POST   /sync/push                     Push data to VPS
GET    /sync/status                   Last sync time
POST   /backup/gdrive                 Backup to Google Drive
POST   /backup/local                  Export local backup
```

---

## 🔐 Security Features

### Data Encryption

- **SQLite:** AES-256 encryption at rest (SEE - SQLite Encryption Extension)
- **Backups:** AES-256 with user-set passphrase
- **API Communication:** TLS 1.3 (via FRP tunnel)
- **Admin Password:** bcrypt (cost factor 12)

### Authentication

- **Windows Admin:** Local password + optional TOTP
- **Mobile App:** GAuth (online) OR local PIN (offline)
- **Manager:** Local password with 8-hour session expiry

### Face Biometric Policy

> Face templates are **never stored as raw images**. Only mathematical embeddings (float vectors) are stored, encrypted at rest. Raw capture images are deleted immediately after enrollment. Employees must provide written/digital consent before face enrollment.

---

## 🔄 Data Synchronization

### Free Tier (≤45 days rolling)

```
Edge Node ──── FRP Tunnel ───► VPS
(Automatic when online)
└─ Last 45 days of data
└─ No charge
```

### Paid Tier (>45 days)

```
Edge Node ──── FRP Tunnel ───► VPS
(Encrypted backup every night)
└─ Unlimited historical data
└─ ₹2 per active member per month + 18% GST
```

**Active Member Definition:** Any member_id with ≥1 attendance event in the billing month.

---

## 📊 Data Storage Locations

| Data Type | Location | Encryption | Notes |
|---|---|---|---|
| Database | `C:\EdgeFolio\data\edgefolio.db` | AES-256 | SQLite file |
| Face Templates | `C:\EdgeFolio\storage\face-templates\` | AES-256 | Float vectors only |
| Backups | `C:\EdgeFolio\storage\backups\` | AES-256 | .pbbackup files |
| Documents | `C:\EdgeFolio\storage\documents\` | None | PDFs, uploaded files |
| Logs | `C:\EdgeFolio\logs\` | None | Plain text logs |

---

## 🐛 Troubleshooting

### Database Connection Failed

```bash
# Check SQLite file
sqlite3 "C:\EdgeFolio\data\edgefolio.db" ".tables"

# Repair database
npm run db:repair
```

### Face Recognition Not Working

```bash
# Verify Python service
python python/face_recognition_service.py --test

# Check camera connection
npm run camera:test
```

### Backend Server Won't Start

```bash
# Check port 7001 is available
netstat -ano | findstr :7001

# Clear cache & reinstall
rm -r node_modules package-lock.json
npm install
npm run server
```

### FRP Tunnel Not Connecting

```bash
# Test tunnel configuration
node backend/config/frpConfig.js

# Verify VPS is reachable
ping <VPS_IP>
```

---

## 📅 Deployment Timeline

### Phase 1 — Core Edge System (Months 1–3)
- ✅ Database schema & backend scaffold
- ✅ JSON attendance input API
- ✅ Employee management module
- ✅ Shift, holiday, leave engine
- ✅ Payroll computation engine
- ✅ Payslip PDF generation
- ✅ Excel/PDF report exports
- ✅ Windows Electron shell

### Phase 2 — Mobile App + VPS (Months 4–6)
- ⏳ Android APK (React Native)
- ⏳ GAuth onboarding flow
- ⏳ FRP tunnel setup
- ⏳ VPS monitoring dashboard
- ⏳ GDrive + VPS backup system

### Phase 3 — Advanced Features (Months 7–9)
- ⏳ Geofencing attendance
- ⏳ WhatsApp payslip delivery
- ⏳ PF/ESI challan export
- ⏳ Multi-branch support
- ⏳ Paid billing engine

---

## 🎓 Key Concepts

| Term | Definition |
|---|---|
| **Edge Node** | Windows PC running EDGEFOLIO at customer premises |
| **Member ID** | Unique employee identifier (EMP-001) |
| **LWP** | Leave Without Pay — unpaid absence deducted from salary |
| **OTA** | Over-The-Air update delivery to mobile app |
| **WAL Mode** | SQLite Write-Ahead Logging (prevents data loss on crash) |
| **FRP Tunnel** | Fast Reverse Proxy — secure communication without public IP |
| **Active Member** | Employee with ≥1 attendance event in billing month |
| **Delta Sync** | Only new/changed records sent to VPS (not full DB) |

---

## 📞 Support & Documentation

- **Project PRD:** `../EDGEFOLIO_System_PRD.md`
- **Backend API Docs:** `./docs/API-Documentation.md`
- **Database Schema:** `./docs/Database-Schema.md`
- **Installation Guide:** `./docs/Installation-Guide.md`
- **Contact:** support@edgefolio.com

---

## 📜 License & Credits

**Project:** EDGEFOLIO v1.0.0  
**By:** Jenix  
**Status:** Development Phase 1  
**Last Updated:** April 2026

---

## 🤝 Contributing

This is an internal project. Contributions welcome from authorized team members. Follow these guidelines:

1. Branch naming: `feature/description` or `bugfix/description`
2. Commit messages: Clear, descriptive, English only
3. Code style: ESLint + Prettier configured
4. Testing: Write unit tests for business logic
5. Documentation: Update README & API docs with changes

---

**EDGEFOLIO — Empowering SMEs with Offline Payroll Management** ✨
