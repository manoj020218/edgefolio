'use strict';
/**
 * CORS for the Android app. Capacitor serves the app from a WebView origin (http://localhost with
 * androidScheme 'http', https://localhost by default, capacitor://localhost on iOS), so every call
 * to this API is cross-origin and the WebView needs these headers — including for the custom
 * X-Org-Code header, which triggers a preflight. Only app routes use this; the EDGE sync API is
 * server-to-server. Extra origins: CORS_ORIGINS="https://a.example,https://b.example".
 */
const DEFAULT_ORIGINS = ['http://localhost', 'https://localhost', 'capacitor://localhost'];

function appCors(extraOrigins = []) {
  const allowed = new Set([...DEFAULT_ORIGINS, ...extraOrigins.filter(Boolean)]);
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Org-Code');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin && allowed.has(origin) ? 204 : 403);
    next();
  };
}

module.exports = { appCors, DEFAULT_ORIGINS };
