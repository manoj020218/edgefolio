import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { acknowledgeCommandController, createCommandController, listCommandsController } from './controller';
import { commandParamsSchema, createCommandSchema } from './validation';

const router = Router();

router.post('/commands', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), validate(createCommandSchema), createCommandController);
router.get('/commands', requireDeviceOrUser, listCommandsController);
router.post('/commands/:id/ack', requireDeviceOrUser, validate(commandParamsSchema, 'params'), acknowledgeCommandController);

export default router;
