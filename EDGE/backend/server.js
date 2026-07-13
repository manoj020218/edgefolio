const cors = require('cors');
const express = require('express');
const { API_PREFIX } = require('./config/app');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { requireLicense } = require('./middleware/license');

const authRoutes          = require('./routes/auth');
const licenseRoutes       = require('./routes/license');
const employeesRoutes     = require('./routes/employees');
const attendanceRoutes    = require('./routes/attendance');
const payrollRoutes       = require('./routes/payroll');
const leavesRoutes        = require('./routes/leaves');
const cashbookRoutes      = require('./routes/cashbook');
const reportsRoutes       = require('./routes/reports');
const syncRoutes          = require('./routes/sync');
const backupRoutes        = require('./routes/backup');
const settingsRoutes      = require('./routes/settings');
const announcementsRoutes = require('./routes/announcements');
const facesRoutes         = require('./routes/faces');
const shiftsRoutes        = require('./routes/shifts');
const departmentsRoutes   = require('./routes/departments');
const holidaysRoutes      = require('./routes/holidays');
const deductionsRoutes    = require('./routes/deductions');
const earningsRoutes      = require('./routes/earnings');
const machinesRoutes      = require('./routes/machines');
const paymentsRoutes      = require('./routes/payments');
const u5machinesRoutes    = require('./routes/u5machines');
const m68Routes           = require('./routes/m68');
const apkRoutes           = require('./routes/apk');

function createServer() {
  const app = express();
  app.disable('x-powered-by');

  // Allow all origins for local Electron app (file:// and localhost)
  app.use(cors({ origin: (_origin, cb) => cb(null, true), credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'edgefolio-backend', timestamp: new Date().toISOString() });
  });

  // Auth — no token required
  app.use(`${API_PREFIX}/auth`, authRoutes);

  // License — no token required (activation screen runs pre-login)
  app.use(`${API_PREFIX}/license`, licenseRoutes);

  // APK public endpoints (config, login-check, offices, auth/login) must be reachable
  // without a session token — mount BEFORE the global requireAuth wall.
  // The apk router applies requireAuth internally to the routes that need it.
  app.use(`${API_PREFIX}/apk`, apkRoutes);

  // All subsequent routes require a valid JWT
  app.use(requireAuth);

  // License enforcement gate (after auth, before business routes)
  app.use(requireLicense);

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.json({ ok: true, apiPrefix: API_PREFIX, timestamp: new Date().toISOString() });
  });

  app.use(`${API_PREFIX}/employees`, employeesRoutes);
  app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
  app.use(`${API_PREFIX}/payroll`,    payrollRoutes);
  app.use(`${API_PREFIX}/leaves`,     leavesRoutes);
  app.use(`${API_PREFIX}/cashbook`,   cashbookRoutes);
  app.use(`${API_PREFIX}/reports`,    reportsRoutes);
  app.use(`${API_PREFIX}/sync`,          syncRoutes);
  app.use(`${API_PREFIX}/backup`,        backupRoutes);
  app.use(`${API_PREFIX}/settings`,      settingsRoutes);
  app.use(`${API_PREFIX}/announcements`, announcementsRoutes);
  app.use(`${API_PREFIX}/faces`,         facesRoutes);
  app.use(`${API_PREFIX}/shifts`,        shiftsRoutes);
  app.use(`${API_PREFIX}/departments`,   departmentsRoutes);
  app.use(`${API_PREFIX}/holidays`,      holidaysRoutes);
  app.use(`${API_PREFIX}/deductions`,    deductionsRoutes);
  app.use(`${API_PREFIX}/earnings`,      earningsRoutes);
  app.use(`${API_PREFIX}/machines`,      machinesRoutes);
  app.use(`${API_PREFIX}/payments`,     paymentsRoutes);
  app.use(`${API_PREFIX}/u5`,           u5machinesRoutes);
  app.use(`${API_PREFIX}/m68`,          m68Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createServer();

module.exports = { app, createServer };
