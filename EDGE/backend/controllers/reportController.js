const {
  getDashboardSummary,
  getAttendanceReport,
  getSalaryReport,
} = require('../services/reportService');
const { sendOk } = require('../utils/http');
const { serializeAttendance, serializePayslip } = require('../utils/serializers');

function dashboardSummaryHandler(_req, res) {
  sendOk(res, getDashboardSummary());
}

function attendanceReportHandler(req, res, next) {
  try {
    const rows = getAttendanceReport({
      from: req.query.from,
      to: req.query.to,
      department: req.query.dept || req.query.department,
    }).map(serializeAttendance);
    return sendOk(res, rows, { count: rows.length });
  } catch (error) {
    return next(error);
  }
}

function salaryReportHandler(req, res, next) {
  try {
    const data = getSalaryReport({
      month: req.query.month,
      department: req.query.dept || req.query.department,
    });
    return sendOk(res, {
      ...data,
      rows: data.rows.map(serializePayslip),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  dashboardSummaryHandler,
  attendanceReportHandler,
  salaryReportHandler,
};
