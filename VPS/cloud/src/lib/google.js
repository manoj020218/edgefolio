'use strict';
/**
 * Verifies a Google ID token from the app's Google sign-in (Credential Manager). Uses Google's
 * tokeninfo endpoint (no extra dependency): signature, expiry and issuer are checked by Google; we
 * check the audience is one of OUR client IDs and the email is verified.
 * Returns { email, name, sub } or throws an error with .status 401.
 */
function createGoogleVerifier(allowedClientIds = []) {
  const allowed = new Set(allowedClientIds.filter(Boolean));
  return async function verify(idToken) {
    if (!idToken || typeof idToken !== 'string') throw Object.assign(new Error('Google sign-in token missing'), { status: 400 });
    if (!allowed.size) throw Object.assign(new Error('Google sign-in is not configured on the server'), { status: 503 });
    let res;
    try {
      res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(10000) });
    } catch {
      throw Object.assign(new Error('Could not reach Google to check the sign-in'), { status: 503 });
    }
    const t = await res.json().catch(() => ({}));
    if (!res.ok || !t.aud) throw Object.assign(new Error('Google sign-in was not accepted'), { status: 401 });
    if (!allowed.has(t.aud)) throw Object.assign(new Error('Google sign-in is for a different app'), { status: 401 });
    if (t.email_verified !== true && t.email_verified !== 'true') throw Object.assign(new Error('Google email is not verified'), { status: 401 });
    return { email: String(t.email).toLowerCase(), name: t.name || t.given_name || t.email, sub: t.sub };
  };
}

module.exports = { createGoogleVerifier };
