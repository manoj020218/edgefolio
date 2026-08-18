import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { deviceParamsSchema } from '../devices/validation';
import { currentHealthController, heartbeatController } from './controller';
import { heartbeatSchema } from './validation';

const router = Router();

router.post('/heartbeat', requireDeviceOrUser, validate(heartbeatSchema), heartbeatController);
router.get('/:deviceId', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), validate(deviceParamsSchema, 'params'), currentHealthController);

export default router;
