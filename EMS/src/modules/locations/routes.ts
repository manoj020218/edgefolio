import { Router } from 'express';
import { requireDeviceOrUser, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { companyLatestLocationsController, employeeRouteController, ingestLocationsController, latestEmployeeLocationController } from './controller';
import { employeeParamsSchema, employeeRouteQuerySchema, ingestLocationSchema } from './validation';

const router = Router();

router.post('/batch', requireDeviceOrUser, validate(ingestLocationSchema), ingestLocationsController);
router.get('/latest', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER'), companyLatestLocationsController);
router.get('/latest/:employeeId', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(employeeParamsSchema, 'params'), latestEmployeeLocationController);
router.get('/route/:employeeId', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'REGIONAL_MANAGER', 'SALES_MANAGER', 'TEAM_LEADER', 'EMPLOYEE'), validate(employeeParamsSchema, 'params'), validate(employeeRouteQuerySchema, 'query'), employeeRouteController);

export default router;
