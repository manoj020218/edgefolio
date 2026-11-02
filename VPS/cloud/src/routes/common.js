'use strict';
/**
 * Plain /api/v1/* endpoints the app reads with its "root" client (EDGE serves these from its main
 * API, shared with the desktop): announcements for the Home screen and the holiday list.
 */
const express = require('express');
const { forOrg } = require('../tenancy');
const { requireAuth } = require('../auth');
const { sendOk } = require('../lib/http');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function commonRouter(config) {
  const r = express.Router();
  const auth = requireAuth(config);   // per route, so unknown /api/v1 paths still get a plain 404

  // EDGE listAnnouncementsHandler: newest first, max 100, target 'all' or the given empId.
  r.get('/announcements', auth, ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const q = {};
    if (since && !Number.isNaN(since.getTime())) q.createdAt = { $gte: since };
    // CLOUD: an employee only ever sees 'all' or their own targeted rows (the query's target is ignored
    // unless it is the caller), so nobody can read someone else's private notice.
    q.target = { $in: ['all', req.user.empId] };
    const rows = await db.Announcement.find(q).sort({ createdAt: -1 }).limit(100).lean();
    const out = rows.map((a) => ({
      id: String(a._id), type: a.type, message: a.message,
      announcedByEmpId: a.announcedByEmpId, announcedByName: a.announcedByName,
      announcedByDesignation: a.announcedByDesignation, target: a.target, sendSms: false, createdAt: a.createdAt,
    }));
    sendOk(res, out, { count: out.length });
  }));

  r.get('/holidays', auth, ah(async (req, res) => {
    const year = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : String(new Date().getFullYear());
    const rows = await forOrg(req.user.orgId).Holiday.find({ date: { $regex: `^${year}-` } }).sort({ date: 1 }).lean();
    sendOk(res, rows.map((h) => ({ id: String(h._id), date: h.date, name: h.name || '' })));
  }));

  return r;
}

module.exports = { commonRouter };
