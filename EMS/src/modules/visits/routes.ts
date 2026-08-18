import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listVisitsController, visitCheckInController, visitCheckOutController } from './controller';
import { visitCheckInSchema, visitCheckOutSchema, visitParamsSchema, visitQuerySchema } from './validation';

const router = Router();

router.post('/check-in', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(visitCheckInSchema), visitCheckInController);
router.post('/:id/check-out', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(visitParamsSchema, 'params'), validate(visitCheckOutSchema), visitCheckOutController);
router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(visitQuerySchema, 'query'), listVisitsController);

export default router;
