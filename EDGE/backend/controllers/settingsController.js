const { getDb } = require('../config/database');
const { sendOk } = require('../utils/http');
const { EDGE_ID } = require('../config/app');

function getCompanySettingsHandler(_req, res) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
  if (!row) return sendOk(res, null);
  return sendOk(res, {
    companyName: row.company_name,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    panNumber: row.pan_number,
    website: row.website,
    updatedAt: row.updated_at,
  });
}

function updateCompanySettingsHandler(req, res, next) {
  try {
    const db = getDb();
    const b = req.body || {};
    db.prepare(`
      INSERT INTO company_settings
        (id, company_name, address, city, state, country, pincode, phone, email, gst_number, pan_number, website, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        company_name  = excluded.company_name,
        address       = excluded.address,
        city          = excluded.city,
        state         = excluded.state,
        country       = excluded.country,
        pincode       = excluded.pincode,
        phone         = excluded.phone,
        email         = excluded.email,
        gst_number    = excluded.gst_number,
        pan_number    = excluded.pan_number,
        website       = excluded.website,
        updated_at    = excluded.updated_at
    `).run(
      b.companyName  ?? b.company_name  ?? null,
      b.address      ?? null,
      b.city         ?? null,
      b.state        ?? null,
      b.country      ?? null,
      b.pincode      ?? null,
      b.phone        ?? null,
      b.email        ?? null,
      b.gstNumber    ?? b.gst_number    ?? null,
      b.panNumber    ?? b.pan_number    ?? null,
      b.website      ?? null,
    );
    return getCompanySettingsHandler(req, res);
  } catch (err) {
    return next(err);
  }
}

function getWorkingHoursHandler(_req, res) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM working_hours WHERE id = 1').get();
  if (!row) return sendOk(res, null);
  return sendOk(res, {
    startTime:     row.start_time,
    endTime:       row.end_time,
    breakDuration: Number(row.break_duration),
    daysPerWeek:   Number(row.days_per_week),
    hoursPerDay:   Number(row.hours_per_day),
    updatedAt:     row.updated_at,
  });
}

function updateWorkingHoursHandler(req, res, next) {
  try {
    const db = getDb();
    const b = req.body || {};
    db.prepare(`
      INSERT INTO working_hours
        (id, start_time, end_time, break_duration, days_per_week, hours_per_day, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        start_time     = excluded.start_time,
        end_time       = excluded.end_time,
        break_duration = excluded.break_duration,
        days_per_week  = excluded.days_per_week,
        hours_per_day  = excluded.hours_per_day,
        updated_at     = excluded.updated_at
    `).run(
      b.startTime    ?? b.start_time    ?? '09:00',
      b.endTime      ?? b.end_time      ?? '18:00',
      Number(b.breakDuration ?? b.break_duration ?? 60),
      Number(b.daysPerWeek   ?? b.days_per_week  ?? 5),
      Number(b.hoursPerDay   ?? b.hours_per_day  ?? 8),
    );
    return getWorkingHoursHandler(req, res);
  } catch (err) {
    return next(err);
  }
}

function getOfficesHandler(_req, res) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
  sendOk(res, {
    companyName: row?.company_name || 'EDGEFOLIO',
    offices: [
      {
        edgeId: EDGE_ID,
        name: row?.city ? `${row.company_name} — ${row.city}` : (row?.company_name || 'Main Office'),
        address: [row?.address, row?.city, row?.state].filter(Boolean).join(', ') || null,
      },
    ],
  });
}

module.exports = {
  getCompanySettingsHandler,
  updateCompanySettingsHandler,
  getWorkingHoursHandler,
  updateWorkingHoursHandler,
  getOfficesHandler,
};
