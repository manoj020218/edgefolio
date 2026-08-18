import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createRecordingController, listRecordingsController } from './controller';
import { createRecordingSchema, recordingQuerySchema } from './validation';

const router = Router();

router.post('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(createRecordingSchema), createRecordingController);
router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(recordingQuerySchema, 'query'), listRecordingsController);

export default router;
