import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCompanyController, listCompaniesController, updateCompanyController } from './controller';
import { companyParamsSchema, createCompanySchema, updateCompanySchema } from './validation';

const router = Router();

router.get('/', listCompaniesController);
router.post('/', requireRoles('SUPER_ADMIN'), validate(createCompanySchema), createCompanyController);
router.patch('/:id', requireRoles('SUPER_ADMIN'), validate(companyParamsSchema, 'params'), validate(updateCompanySchema), updateCompanyController);

export default router;
