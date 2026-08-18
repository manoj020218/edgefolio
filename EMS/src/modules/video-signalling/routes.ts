import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { answerSessionController, createSessionController, endSessionController, listSessionsController } from './controller';
import { createSessionSchema, sessionParamsSchema } from './validation';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), listSessionsController);
router.post('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(createSessionSchema), createSessionController);
router.post('/:id/answer', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(sessionParamsSchema, 'params'), answerSessionController);
router.post('/:id/end', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(sessionParamsSchema, 'params'), endSessionController);

export default router;
