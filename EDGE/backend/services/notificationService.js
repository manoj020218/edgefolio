const { sendSms } = require('./smsService');

function notifyLeaveStatus({ employeePhone, employeeName, status }) {
  const message = `Hello ${employeeName}, your leave request is ${status}.`;
  return sendSms({
    to: employeePhone,
    message,
  });
}

function notifyPayrollGenerated({ employeePhone, employeeName, month }) {
  const message = `Hello ${employeeName}, payslip for ${month} is ready.`;
  return sendSms({
    to: employeePhone,
    message,
  });
}

module.exports = {
  notifyLeaveStatus,
  notifyPayrollGenerated,
};
