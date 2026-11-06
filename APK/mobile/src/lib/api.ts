import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

const BASE_URL_KEY = 'edgefolio.baseUrl';
const TOKEN_KEY = 'edgefolio.token';
const ORG_CODE_KEY = 'edgefolio.orgCode';

// EdgeFolio Cloud (VPS/cloud). In Cloud mode the phone talks to this fixed address instead of an
// office PC, and identifies the company with the code the employee typed once at setup
// (sent as X-Org-Code; after login the server takes the company from the token).
export const CLOUD_BASE_URL = 'https://edgefolio.iotsoft.in/cloud/api/v1';
let cachedOrgCode: string | null | undefined;

export async function getOrgCode(): Promise<string | null> {
  if (cachedOrgCode !== undefined) return cachedOrgCode;
  const { value } = await Preferences.get({ key: ORG_CODE_KEY });
  cachedOrgCode = value ?? null;
  return cachedOrgCode;
}

// Sync read for render paths (valid once App has awaited getBaseUrl()/getOrgCode() at start).
export function isCloudModeSync(): boolean {
  return Boolean(cachedOrgCode) && cachedBaseUrl === CLOUD_BASE_URL;
}
export function cachedOrgCodeSync(): string | null {
  return cachedOrgCode ?? null;
}

export async function setCloudMode(orgCode: string): Promise<void> {
  const code = orgCode.trim().toUpperCase();
  cachedOrgCode = code;
  await Preferences.set({ key: ORG_CODE_KEY, value: code });
  await setBaseUrl(CLOUD_BASE_URL);
}

// "Change company / server" on the login screen: forget the connection (and any token) so the
// setup screen shows again on reload.
export async function resetConnection(): Promise<void> {
  cachedOrgCode = null;
  cachedBaseUrl = null;
  await Preferences.remove({ key: ORG_CODE_KEY });
  await Preferences.remove({ key: BASE_URL_KEY });
  await Preferences.remove({ key: TOKEN_KEY });
}

// Office-PC (LAN) mode: forget any company code.
export async function clearOrgCode(): Promise<void> {
  cachedOrgCode = null;
  await Preferences.remove({ key: ORG_CODE_KEY });
}

// ── Cloud sign-up / Google sign-in (pre-login; VPS/cloud/src/routes/owner.js) ──────────────────
export interface CloudSession {
  token: string;
  orgCode: string;
  companyName: string;
  licenseKey?: string;
  created?: boolean;
  user: {
    empId: string; empCode: string; name: string; department: string | null; designation: string | null;
    role: 'owner' | 'hr-admin' | 'employee'; isFieldEmployee: boolean; passwordMustChange: boolean;
  };
}

async function cloudPost<T>(path: string, body: unknown, orgCode?: string): Promise<T> {
  const res = await axios.post<ApiEnvelope<T>>(`${CLOUD_BASE_URL}/apk${path}`, body, {
    headers: orgCode ? { 'X-Org-Code': orgCode } : {},
    validateStatus: () => true,
    timeout: 30000,
  });
  if (!res.data?.ok) throw toApiError(res.data ?? { ok: false, error: 'Could not reach EdgeFolio Cloud' });
  return res.data.data as T;
}

export function cloudSignup(body: { idToken: string; companyName: string; phone?: string; ownerName?: string; licenseKey?: string }): Promise<CloudSession> {
  return cloudPost<CloudSession>('/signup', body);
}

export function cloudGoogleLogin(idToken: string, orgCode?: string): Promise<CloudSession | { chooseCompany: { orgCode: string; companyName: string }[] }> {
  return cloudPost('/auth/google', { idToken }, orgCode);
}

// Pre-setup check of a company code: returns the company's name, or throws ApiError.
export async function checkCompanyCode(orgCode: string): Promise<{ companyName: string }> {
  const res = await axios.get<ApiEnvelope<{ company_name?: string }>>(`${CLOUD_BASE_URL}/apk/config`, {
    headers: { 'X-Org-Code': orgCode.trim().toUpperCase() },
    validateStatus: () => true,
    timeout: 15000,
  });
  if (!res.data?.ok) throw toApiError(res.data ?? { ok: false, error: 'Could not reach EdgeFolio Cloud' });
  return { companyName: res.data.data?.company_name || '' };
}

// EDGE is a local Windows PC on the same LAN/Wi-Fi as the phone — there is no
// fixed hostname. The user sets this once (Settings screen, not yet built) to
// the PC's LAN IP, e.g. http://192.168.1.50:7001/api/v1
let cachedBaseUrl: string | null = null;

export async function getBaseUrl(): Promise<string | null> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const { value } = await Preferences.get({ key: BASE_URL_KEY });
  cachedBaseUrl = value ?? null;
  return cachedBaseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  const trimmed = url.replace(/\/+$/, '');
  cachedBaseUrl = trimmed;
  await Preferences.set({ key: BASE_URL_KEY, value: trimmed });
}

// The stored base URL is .../api/v1 (see setBaseUrl callers) — the plain
// unauthenticated /health route (used for reachability checks) lives one
// level up, at the server root.
export async function getServerRoot(): Promise<string | null> {
  const base = await getBaseUrl();
  return base ? base.replace(/\/api\/v1$/, '') : null;
}

export async function getToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
  else await Preferences.remove({ key: TOKEN_KEY });
}

function makeClient(routePrefix: string) {
  const instance = axios.create();

  instance.interceptors.request.use(async (cfg) => {
    const base = await getBaseUrl();
    if (!base) throw new Error('EdgeFolio server address not configured yet');
    cfg.baseURL = `${base}${routePrefix}`;

    const token = await getToken();
    if (token) cfg.headers.Authorization = `Bearer ${token}`;

    // Cloud mode: which company (needed before login; harmless after — the token decides).
    const orgCode = base === CLOUD_BASE_URL ? await getOrgCode() : null;
    if (orgCode) cfg.headers['X-Org-Code'] = orgCode;

    return cfg;
  });

  // EDGE returns non-2xx (401/403/422/500) for every error case, so axios rejects
  // before the `res.data.ok` checks below ever run — normalize here instead.
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      const data = err?.response?.data as ApiEnvelope<unknown> | undefined;
      if (data && typeof data === 'object' && 'ok' in data) throw toApiError(data);
      throw err;
    },
  );

  return instance;
}

// Most endpoints live under /apk (EDGE/backend/routes/apk.js). A handful — login,
// password change/reset — live under /auth (EDGE/backend/routes/auth.js) instead,
// since they're shared with the desktop EDGE admin app, not APK-specific.
const client = makeClient('/apk');
const authClient = makeClient('/auth');
// Plain /api/v1 root — for endpoints shared with the desktop app that aren't
// APK-specific (e.g. announcements). Same requireAuth+requireLicense gate applies.
const rootClient = makeClient('');

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  meta?: unknown;
  // Two shapes exist in EDGE/backend/controllers/apkController.js:
  // - generic errors (errorHandler middleware): { ok:false, error: "<human message>" }
  // - specific business errors (e.g. mobileAttendanceHandler): { ok:false, error: "<CODE>", message: "<human message>" }
  error?: string;
  message?: string;
}

function toApiError<T>(env: ApiEnvelope<T>): ApiError {
  const code = env.error ?? 'ERROR';
  const message = env.message ?? env.error ?? 'Request failed';
  return new ApiError(code, message);
}

export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.get<ApiEnvelope<T>>(path, { params });
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

// Like apiGet but also returns the envelope's `meta` (e.g. calendar summary).
export async function apiGetFull<T>(path: string, params?: Record<string, unknown>): Promise<{ data: T; meta: unknown }> {
  const res = await client.get<ApiEnvelope<T>>(path, { params });
  if (!res.data.ok) throw toApiError(res.data);
  return { data: res.data.data as T, meta: res.data.meta };
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await client.post<ApiEnvelope<T>>(path, body);
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await client.patch<ApiEnvelope<T>>(path, body);
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await client.put<ApiEnvelope<T>>(path, body);
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await client.delete<ApiEnvelope<T>>(path);
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

// Same shape as apiGet/apiPost, against EDGE/backend/routes/auth.js instead of apk.js
// (forgot-password, change-password, reset-request admin approval).
export async function authApiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await authClient.get<ApiEnvelope<T>>(path, { params });
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export async function authApiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await authClient.post<ApiEnvelope<T>>(path, body);
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export async function rootApiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await rootClient.get<ApiEnvelope<T>>(path, { params });
  if (!res.data.ok) throw toApiError(res.data);
  return res.data.data as T;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
