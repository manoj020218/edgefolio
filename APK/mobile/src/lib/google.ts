import { SocialLogin } from '@capgo/capacitor-social-login';

// Web OAuth client of the Google Cloud project behind edgefolio.iotsoft.in's sign-in (public value,
// also served by GET /api/onboard/google-config). Android needs ITS OWN Android OAuth client in the
// same project (package in.iotsoft.edgefolio + the release key's SHA-1) or the sign-in sheet fails.
export const GOOGLE_WEB_CLIENT_ID = '676141356881-2n0nm3o9kro61248520jb3pduud2pd1k.apps.googleusercontent.com';

let initialized = false;

/** Opens Google's account picker and returns an ID token for the EdgeFolio Cloud to verify. */
export async function googleIdToken(): Promise<string> {
  if (!initialized) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
    initialized = true;
  }
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'], prompt: 'select_account' } });
  const result = res.result as { idToken?: string | null };
  if (!result?.idToken) throw new Error('Google sign-in did not return a token. Please try again.');
  return result.idToken;
}
