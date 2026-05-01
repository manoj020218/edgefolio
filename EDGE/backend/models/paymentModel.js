const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

// ── Bank Templates ─────────────────────────────────────────────────────────────

function listBankTemplates() {
  return getDb().prepare('SELECT * FROM bank_templates ORDER BY template_name').all();
}

function getBankTemplate(id) {
  return getDb().prepare('SELECT * FROM bank_templates WHERE template_id = ?').get(id);
}

function createBankTemplate({ templateName, bankName, exportFormat, fieldMappings, payerAccount, payerIfsc, payerName, purposeCode }) {
  const db = getDb();
  const id = `BT-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO bank_templates (template_id, template_name, bank_name, export_format, field_mappings, payer_account, payer_ifsc, payer_name, purpose_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(templateName).trim(), String(bankName).trim(), exportFormat || 'csv',
    JSON.stringify(fieldMappings || {}), payerAccount || null, payerIfsc || null, payerName || null, purposeCode || 'SALARY');
  return db.prepare('SELECT * FROM bank_templates WHERE template_id = ?').get(id);
}

function updateBankTemplate(id, { templateName, bankName, exportFormat, fieldMappings, payerAccount, payerIfsc, payerName, purposeCode }) {
  const db = getDb();
  db.prepare(`
    UPDATE bank_templates SET template_name = ?, bank_name = ?, export_format = ?, field_mappings = ?,
    payer_account = ?, payer_ifsc = ?, payer_name = ?, purpose_code = ?, updated_at = CURRENT_TIMESTAMP
    WHERE template_id = ?
  `).run(String(templateName).trim(), String(bankName).trim(), exportFormat || 'csv',
    JSON.stringify(fieldMappings || {}), payerAccount || null, payerIfsc || null, payerName || null, purposeCode || 'SALARY', id);
  return db.prepare('SELECT * FROM bank_templates WHERE template_id = ?').get(id);
}

function deleteBankTemplate(id) {
  return getDb().prepare('DELETE FROM bank_templates WHERE template_id = ?').run(id).changes > 0;
}

// ── Payment Batches ────────────────────────────────────────────────────────────

function listPaymentBatches() {
  return getDb().prepare(`
    SELECT pb.*, bt.template_name, bt.bank_name AS tpl_bank_name
    FROM payment_batches pb
    LEFT JOIN bank_templates bt ON pb.template_id = bt.template_id
    ORDER BY pb.created_at DESC
  `).all();
}

function getPaymentBatch(batchId) {
  return getDb().prepare(`
    SELECT pb.*, bt.template_name, bt.bank_name AS tpl_bank_name, bt.export_format,
           bt.field_mappings, bt.payer_account, bt.payer_ifsc, bt.payer_name, bt.purpose_code AS tpl_purpose_code
    FROM payment_batches pb
    LEFT JOIN bank_templates bt ON pb.template_id = bt.template_id
    WHERE pb.batch_id = ?
  `).get(batchId);
}

function createPaymentBatch({ monthKey, monthLabel, templateId, notes }) {
  const db = getDb();
  const id = `PB-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO payment_batches (batch_id, month_key, month_label, template_id, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, monthKey, monthLabel, templateId || null, notes || null);
  return db.prepare('SELECT * FROM payment_batches WHERE batch_id = ?').get(id);
}

function updatePaymentBatch(batchId, { status, totalEmployees, totalAmount, paidCount, failedCount }) {
  getDb().prepare(`
    UPDATE payment_batches SET status = ?, total_employees = ?, total_amount = ?,
    paid_count = ?, failed_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE batch_id = ?
  `).run(status, totalEmployees, totalAmount, paidCount, failedCount, batchId);
}

function deletePaymentBatch(batchId) {
  return getDb().prepare('DELETE FROM payment_batches WHERE batch_id = ?').run(batchId).changes > 0;
}

// ── Payment Records ────────────────────────────────────────────────────────────

function insertPaymentRecords(records) {
  const db = getDb();
  const ins = db.prepare(`
    INSERT INTO payment_records
      (record_id, batch_id, payslip_id, employee_id, employee_name, emp_code,
       account_name, account_number, ifsc, bank_name, amount, mode, purpose_code,
       currency, employee_email, employee_phone, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const r of records) {
      ins.run(
        r.recordId, r.batchId, r.payslipId || null, r.employeeId, r.employeeName, r.empCode || null,
        r.accountName || r.employeeName, r.accountNumber || null, r.ifsc || null, r.bankName || null,
        r.amount, r.mode || 'NEFT', r.purposeCode || 'SALARY', r.currency || 'INR',
        r.employeeEmail || null, r.employeePhone || null, r.remarks || null,
      );
    }
  });
  tx();
}

function getPaymentRecordsByBatch(batchId) {
  return getDb().prepare('SELECT * FROM payment_records WHERE batch_id = ? ORDER BY employee_name').all(batchId);
}

function updatePaymentRecord(recordId, { status, bankTransactionId, paymentDate, errorReason }) {
  getDb().prepare(`
    UPDATE payment_records SET status = ?, bank_transaction_id = ?, payment_date = ?, error_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE record_id = ?
  `).run(status, bankTransactionId || null, paymentDate || null, errorReason || null, recordId);
}

function bulkUpdatePaymentRecords(batchId, updates) {
  const db = getDb();
  const upd = db.prepare(`
    UPDATE payment_records SET status = ?, bank_transaction_id = ?, payment_date = ?, error_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE record_id = ?
  `);
  const tx = db.transaction(() => {
    for (const u of updates) {
      upd.run(u.status, u.bankTransactionId || null, u.paymentDate || null, u.errorReason || null, u.recordId);
    }
  });
  tx();
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM payment_records WHERE batch_id = ?
  `).get(batchId);
  db.prepare(`
    UPDATE payment_batches SET paid_count = ?, failed_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE batch_id = ?
  `).run(counts.paid || 0, counts.failed || 0, batchId);
}

module.exports = {
  listBankTemplates, getBankTemplate, createBankTemplate, updateBankTemplate, deleteBankTemplate,
  listPaymentBatches, getPaymentBatch, createPaymentBatch, updatePaymentBatch, deletePaymentBatch,
  insertPaymentRecords, getPaymentRecordsByBatch, updatePaymentRecord, bulkUpdatePaymentRecords,
};
