const express = require('express');
const {
  getCompanySettingsHandler,
  updateCompanySettingsHandler,
  getWorkingHoursHandler,
  updateWorkingHoursHandler,
  getOfficesHandler,
} = require('../controllers/settingsController');

const router = express.Router();
router.get('/company', getCompanySettingsHandler);
router.put('/company', updateCompanySettingsHandler);
router.get('/working-hours', getWorkingHoursHandler);
router.put('/working-hours', updateWorkingHoursHandler);
router.get('/offices', getOfficesHandler);
module.exports = router;
