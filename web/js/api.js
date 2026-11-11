import { t, has } from './i18n.js';

const BASE = '/functions/v1/app';

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network_unavailable', 0);
  }
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON error body */ }
  if (!response.ok) throw new ApiError(typeof data?.error === 'string' ? data.error : 'service_unavailable', response.status);
  return data;
}

export function errorText(error) {
  const key = `err.${error?.code}`;
  return has(key) ? t(key) : t('err.service_unavailable');
}