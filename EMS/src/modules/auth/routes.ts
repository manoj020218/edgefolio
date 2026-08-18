import { Router } from 'express';
import { authenticate, requireUser } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { loginController, logoutController, meController, refreshController } from './controller';
import { loginSchema, logoutSchema, refreshSchema } from './validation';

const router = Router();

router.post('/login', authRateLimit, validate(loginSchema), loginController);
router.post('/refresh', authRateLimit, validate(refreshSchema), refreshController);
router.post('/logout', validate(logoutSchema), logoutController);
router.get('/me', authenticate, requireUser, meController);

export default router;
