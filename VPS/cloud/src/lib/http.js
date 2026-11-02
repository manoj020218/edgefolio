'use strict';
// Same envelope as EDGE (EDGE/backend/utils/http.js), so the app's api.ts parses both alike:
//   success  { ok:true, data, meta }
//   error    { ok:false, error:"<message>" }  or  { ok:false, error:"<CODE>", message:"<text>" }

function sendOk(res, data, meta = {}) {
  res.json({ ok: true, data, meta });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Business errors the app switches on by code (e.g. MOBILE_BLOCKED, LOGIN_BLOCKED).
function sendCode(res, status, code, message) {
  res.status(status).json({ ok: false, error: code, message });
}

// Same as sendCode but thrown from deep inside a handler; app.js's error handler renders it.
function codedError(status, code, message) {
  const err = httpError(status, message);
  err.errorCode = code;
  return err;
}

module.exports = { sendOk, httpError, sendCode, codedError };
