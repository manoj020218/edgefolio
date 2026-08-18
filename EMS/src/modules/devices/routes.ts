import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { assignDeviceController, getDeviceStatusController, listDevicesController, registerDeviceController, unassignDeviceController, updateFcmTokenController } from './controller';
import { assignDeviceSchema, deviceParamsSchema, registerDeviceSchema, updateFcmTokenSchema } from './validation';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), listDevicesController);
router.post('/register', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(registerDeviceSchema), registerDeviceController);
router.post('/:deviceId/assign', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(deviceParamsSchema, 'params'), validate(assignDeviceSchema), assignDeviceController);
router.post('/:deviceId/unassign', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(deviceParamsSchema, 'params'), unassignDeviceController);
router.patch('/:deviceId/fcm-token', requireDeviceOrUser, validate(deviceParamsSchema, 'params'), validate(updateFcmTokenSchema), updateFcmTokenController);
router.get('/:deviceId/status', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), validate(deviceParamsSchema, 'params'), getDeviceStatusController);

export default router;
