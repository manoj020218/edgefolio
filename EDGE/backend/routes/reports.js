const express = require('express');
const {
  dashboardSummaryHandler,
  attendanceReportHandler,
  salaryReportHandler,
} = require('../controllers/reportController');

const router = express.Router();

router.get('/dashboard', dashboardSummaryHandler);
router.get('/attendance', attendanceReportHandler);
router.get('/salary', salaryReportHandler);

module.exports = router;
