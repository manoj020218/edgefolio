import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

const BASE_URL_KEY = 'edgefolio.baseUrl';
const TOKEN_KEY = 'edgefolio.token';

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

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
