import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { listAuditController } from './controller';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), listAuditController);

export default router;
