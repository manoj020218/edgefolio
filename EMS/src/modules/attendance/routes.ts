import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { attendanceHistoryController, checkInController, checkOutController, todayAttendanceController } from './controller';
import { attendanceHistoryQuerySchema, checkInSchema, checkOutSchema } from './validation';

const router = Router();

router.post('/check-in', requireDeviceOrUser, validate(checkInSchema), checkInController);
router.post('/check-out', requireDeviceOrUser, validate(checkOutSchema), checkOutController);
router.get('/today', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(attendanceHistoryQuerySchema.partial({ start: true, end: true }), 'query'), todayAttendanceController);
router.get('/history', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(attendanceHistoryQuerySchema, 'query'), attendanceHistoryController);

export default router;
