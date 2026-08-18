import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createUserController, listUsersController, updateUserController } from './controller';
import { createUserSchema, updateUserSchema, userParamsSchema } from './validation';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), listUsersController);
router.post('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(createUserSchema), createUserController);
router.patch('/:id', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(userParamsSchema, 'params'), validate(updateUserSchema), updateUserController);

export default router;
