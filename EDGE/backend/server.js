const cors = require('cors');
const express = require('express');
const { API_PREFIX } = require('./config/app');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes          = require('./routes/auth');
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

  // All subsequent routes get JWT-based auth (falls back to local user if no token)
  app.use(requireAuth);

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

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createServer();

module.exports = { app, createServer };
