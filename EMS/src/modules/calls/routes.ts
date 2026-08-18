import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { dailySummaryController, ingestCallController, listCallsController } from './controller';
import { callQuerySchema, ingestCallSchema } from './validation';

const router = Router();

router.post('/ingest', requireDeviceOrUser, validate(ingestCallSchema), ingestCallController);
router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(callQuerySchema, 'query'), listCallsController);
router.get('/summary/daily', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(callQuerySchema, 'query'), dailySummaryController);

export default router;
