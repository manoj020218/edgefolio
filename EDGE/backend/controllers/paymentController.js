const { randomUUID } = require('crypto');
const {
  listBankTemplates, getBankTemplate, createBankTemplate, updateBankTemplate, deleteBankTemplate,
  listPaymentBatches, getPaymentBatch, createPaymentBatch, updatePaymentBatch, deletePaymentBatch,
  insertPaymentRecords, getPaymentRecordsByBatch, bulkUpdatePaymentRecords,
} = require('../models/paymentModel');
const { getDb } = require('../config/database');
const { sendOk, createHttpError } = require('../utils/http');

// ── Serializers ────────────────────────────────────────────────────────────────

function parseFieldMappings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function serializeTemplate(row) {
  if (!row) return null;
  return {
    templateId: row.template_id,
    templateName: row.template_name,
    bankName: row.bank_name,
    exportFormat: row.export_format,
    fieldMappings: parseFieldMappings(row.field_mappings),
    payerAccount: row.payer_account,
    payerIfsc: row.payer_ifsc,
    payerName: row.payer_name,
    purposeCode: row.purpose_code,
    createdAt: row.created_at,
  };
}

function serializeBatch(row) {
  if (!row) return null;
  return {
    batchId: row.batch_id,
    monthKey: row.month_key,
    monthLabel: row.month_label,
    templateId: row.template_id,
    templateName: row.template_name,
    bankName: row.tpl_bank_name,
    exportFormat: row.export_format,
    fieldMappings: parseFieldMappings(row.field_mappings),
    payerAccount: row.payer_account,
    payerIfsc: row.payer_ifsc,
    payerName: row.payer_name,
    purposeCode: row.tpl_purpose_code,
    status: row.status,
    totalEmployees: row.total_employees,
    totalAmount: row.total_amount,
    paidCount: row.paid_count,
    failedCount: row.failed_count,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function serializeRecord(row) {
  if (!row) return null;
  return {
    recordId: row.record_id,
    batchId: row.batch_id,
    payslipId: row.payslip_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    empCode: row.emp_code,
    accountName: row.account_name,
    accountNumber: row.account_number,
    ifsc: row.ifsc,
    bankName: row.bank_name,
    amount: row.amount,
    mode: row.mode,
    purposeCode: row.purpose_code,
    currency: row.currency,
    paymentDate: row.payment_date,
    bankTransactionId: row.bank_transaction_id,
    status: row.status,
    errorReason: row.error_reason,
    remarks: row.remarks,
    employeeEmail: row.employee_email,
    employeePhone: row.employee_phone,
  };
}

// ── Bank Template handlers ─────────────────────────────────────────────────────

function listTemplatesHandler(_req, res) {
  sendOk(res, listBankTemplates().map(serializeTemplate));
}

function createTemplateHandler(req, res, next) {
  try {
    const row = createBankTemplate(req.body);
    res.status(201);
    sendOk(res, serializeTemplate(row));
  } catch (e) { next(e); }
}

function updateTemplateHandler(req, res, next) {
  const row = updateBankTemplate(req.params.id, req.body);
  if (!row) return next(createHttpError(404, 'Template not found'));
  sendOk(res, serializeTemplate(row));
}

function deleteTemplateHandler(req, res, next) {
  const ok = deleteBankTemplate(req.params.id);
  if (!ok) return next(createHttpError(404, 'Template not found'));
  sendOk(res, { deleted: true });
}

// ── Payment Batch handlers ─────────────────────────────────────────────────────

function listBatchesHandler(_req, res) {
  sendOk(res, listPaymentBatches().map(serializeBatch));
}

function getBatchHandler(req, res, next) {
  const batch = getPaymentBatch(req.params.id);
  if (!batch) return next(createHttpError(404, 'Batch not found'));
  const records = getPaymentRecordsByBatch(req.params.id);
  sendOk(res, { batch: serializeBatch(batch), records: records.map(serializeRecord) });
}

function createBatchHandler(req, res, next) {
  try {
    const { monthKey, templateId, notes } = req.body;
    if (!monthKey) return next(createHttpError(400, 'monthKey required'));

    const db = getDb();
    const payslips = db.prepare(`
      SELECT p.payslip_id, p.employee_id, p.employee_name, p.month, p.net_salary, p.emp_code,
             p.employee_email, p.employee_phone,
             e.bank_account_number, e.bank_ifsc, e.bank_name AS emp_bank_name,
             e.payment_mode, e.phone AS emp_phone, e.email AS emp_email
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ?
    `).all(monthKey);

    if (payslips.length === 0) {
      return next(createHttpError(400, `No payslips found for ${monthKey}. Run payroll first.`));
    }

    const [year, mon] = monthKey.split('-');
    const monthLabel = new Date(Number(year), Number(mon) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const batch = createPaymentBatch({ monthKey, monthLabel, templateId, notes });

    const records = payslips.map((p) => ({
      recordId: `PR-${randomUUID().slice(0, 8).toUpperCase()}`,
      batchId: batch.batch_id,
      payslipId: p.payslip_id,
      employeeId: p.employee_id,
      employeeName: p.employee_name,
      empCode: p.emp_code,
      accountName: p.employee_name,
      accountNumber: p.bank_account_number || '',
      ifsc: p.bank_ifsc || '',
      bankName: p.emp_bank_name || '',
      amount: Number(p.net_salary),
      mode: p.payment_mode || 'NEFT',
      purposeCode: 'SALARY',
      currency: 'INR',
      employeeEmail: p.employee_email || p.emp_email || '',
      employeePhone: p.employee_phone || p.emp_phone || '',
      remarks: `${monthLabel} Salary`,
    }));

    insertPaymentRecords(records);

    const totalAmount = records.reduce((s, r) => s + r.amount, 0);
    updatePaymentBatch(batch.batch_id, { status: 'ready', totalEmployees: records.length, totalAmount, paidCount: 0, failedCount: 0 });

    const finalBatch = getPaymentBatch(batch.batch_id);
    res.status(201);
    sendOk(res, { batch: serializeBatch(finalBatch), records: records.map(serializeRecord) });
  } catch (e) { next(e); }
}

function deleteBatchHandler(req, res, next) {
  const ok = deletePaymentBatch(req.params.id);
  if (!ok) return next(createHttpError(404, 'Batch not found'));
  sendOk(res, { deleted: true });
}

// ── Import bank response ───────────────────────────────────────────────────────

function importResponseHandler(req, res, next) {
  try {
    const { id: batchId } = req.params;
    const batch = getPaymentBatch(batchId);
    if (!batch) return next(createHttpError(404, 'Batch not found'));

    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return next(createHttpError(400, 'No update records provided'));
    }

    bulkUpdatePaymentRecords(batchId, updates);

    const finalBatch = getPaymentBatch(batchId);
    const records = getPaymentRecordsByBatch(batchId);
    sendOk(res, { batch: serializeBatch(finalBatch), records: records.map(serializeRecord) });
  } catch (e) { next(e); }
}

module.exports = {
  listTemplatesHandler, createTemplateHandler, updateTemplateHandler, deleteTemplateHandler,
  listBatchesHandler, getBatchHandler, createBatchHandler, deleteBatchHandler,
  importResponseHandler,
};
