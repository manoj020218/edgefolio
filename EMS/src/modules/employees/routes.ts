import { Router } from 'express';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createEmployeeController, getEmployeeController, listEmployeesController, updateEmployeeController } from './controller';
import { createEmployeeSchema, employeeParamsSchema, updateEmployeeSchema } from './validation';

const router = Router();

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), listEmployeesController);
router.get('/:id', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(employeeParamsSchema, 'params'), getEmployeeController);
router.post('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(createEmployeeSchema), createEmployeeController);
router.patch('/:id', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), validate(employeeParamsSchema, 'params'), validate(updateEmployeeSchema), updateEmployeeController);

export default router;
