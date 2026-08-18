import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { authenticate } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error-handler';
import authRoutes from './modules/auth/routes';
import companiesRoutes from './modules/companies/routes';
import usersRoutes from './modules/users/routes';
import employeesRoutes from './modules/employees/routes';
import devicesRoutes from './modules/devices/routes';
import locationsRoutes from './modules/locations/routes';
import attendanceRoutes from './modules/attendance/routes';
import visitsRoutes from './modules/visits/routes';
import callsRoutes from './modules/calls/routes';
import recordingsRoutes from './modules/recordings/routes';
import deviceHealthRoutes from './modules/device-health/routes';
import notificationsRoutes from './modules/notifications/routes';
import videoRoutes from './modules/video-signalling/routes';
import auditRoutes from './modules/audit/routes';

export function createApp() {
  const app = express();
  const api = express.Router();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((v) => v.trim()), credentials: false }));
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => res.json({ success: true, data: { ok: true } }));

  app.use('/api/v1/auth', authRoutes);

  api.use(authenticate);
  api.use('/companies', companiesRoutes);
  api.use('/users', usersRoutes);
  api.use('/employees', employeesRoutes);
  api.use('/devices', devicesRoutes);
  api.use('/locations', locationsRoutes);
  api.use('/attendance', attendanceRoutes);
  api.use('/visits', visitsRoutes);
  api.use('/calls', callsRoutes);
  api.use('/recordings', recordingsRoutes);
  api.use('/device-health', deviceHealthRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/video-sessions', videoRoutes);
  api.use('/audit', auditRoutes);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
