'use strict';
/**
 * IoT billing platform (iotsoft.in, /var/www/billing-platform) — every organisation is registered
 * there (plan §8). Uses:
 *   POST /api/edgefolio/signup                 (existing, public) → creates Client + EdgeLicense
 *   POST /api/edgefolio/cloud/verify-license   (server-to-server, X-Cloud-Key) → licence details
 *   POST /api/edgefolio/cloud/link             (server-to-server, X-Cloud-Key) → records the cloud org
 *   POST /api/edgefolio/cloud/find-license     (server-to-server, X-Cloud-Key) → licence for a Google-verified email
 * Nothing about plans or prices is ever shown to users from here.
 */
function createBilling({ baseUrl, apiKey }) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const configured = Boolean(base);

  async function call(path, body, { withKey = false } = {}) {
    if (!configured) throw Object.assign(new Error('Billing platform is not configured'), { status: 503 });
    const headers = { 'content-type': 'application/json' };
    if (withKey) headers['x-cloud-key'] = apiKey || '';
    let res;
    try {
      res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    } catch {
      throw Object.assign(new Error('Registration service is not reachable, please try again'), { status: 503, offline: true });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || `Registration failed (HTTP ${res.status})`), { status: res.status, body: json });
    return json;
  }

  return {
    configured,
    /** → { licenseKey } ; 409 when this phone/email already has a licence. */
    signup: ({ companyName, contactName, phone, email }) =>
      call('/api/edgefolio/signup', { companyName, contactName, phone, email, agentCode: 'cloud-app' }),
    /** → { valid, licenseKey, clientId, companyName, ownerName, ownerEmail, ownerPhone, status } */
    verifyLicense: (licenseKey) => call('/api/edgefolio/cloud/verify-license', { licenseKey }, { withKey: true }),
    /** Only ever called with an email Google has verified. → same shape as verifyLicense, or 404. */
    findLicenseByEmail: (email) => call('/api/edgefolio/cloud/find-license', { email }, { withKey: true }),
    link: ({ licenseKey, orgCode, maxActiveEmployees }) =>
      call('/api/edgefolio/cloud/link', { licenseKey, orgCode, maxActiveEmployees }, { withKey: true }),
  };
}

module.exports = { createBilling };
