import sample from '../../shared/sample-data.json';
import { normaliseRecords } from './normalise.js';
import { clearSession, getToken } from './auth.js';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const STORAGE = 'sludge-smart:v1';

const PATHS = {
  generation: '/generation',
  lab: '/characterisation',
  handling: '/handling',
  disposal: '/disposals',
  compliance: '/compliance/checkpoints',
  consignments: '/compliance/consignments',
};

let offline = false;
let lastError = null;

export const isOffline = () => offline;
export const getLastError = () => lastError;
export const clearLastError = () => { lastError = null; };

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.kind = options.kind || 'request';
    this.detail = options.detail || '';
  }
}

export const isOfflineError = (error) => error instanceof ApiError && error.kind === 'network';

function detailFrom(body, fallback) {
  const detail = body && typeof body === 'object' ? body.detail : null;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return fallback;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
    offline = false;
    lastError = null;
    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const fallback = `Request failed (${response.status})`;
      const detail = detailFrom(body, fallback);
      const isLogin = path === '/auth/login';
      let error;

      if (response.status === 401) {
        const message = isLogin
          ? (detail === fallback ? 'Invalid username or password.' : detail)
          : (detail === fallback ? 'Session expired. Sign in again.' : detail);
        error = new ApiError(message, { status: 401, kind: 'auth', detail });
        if (!isLogin && token) {
          clearSession('session-expired');
        } else if (isLogin) {
          lastError = error;
        }
      } else if (response.status === 403) {
        const message = detail === fallback
          ? 'You do not have permission to perform this action.'
          : detail;
        error = new ApiError(message, {
          status: 403,
          kind: 'authorization',
          detail,
        });
        lastError = error;
      } else if (response.status === 423) {
        error = new ApiError(
          detail === fallback ? 'Account locked after too many failed attempts. Try again later.' : detail,
          { status: 423, kind: 'lockout', detail },
        );
        lastError = error;
      } else if (response.status >= 500) {
        error = new ApiError(`Server error (${response.status}): ${detail}`, {
          status: response.status,
          kind: 'server',
          detail,
        });
        lastError = error;
      } else {
        error = new ApiError(detail, { status: response.status, kind: 'request', detail });
        lastError = error;
      }
      throw error;
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      const error = new ApiError('Backend returned an invalid response.', { kind: 'request' });
      lastError = error;
      throw error;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    offline = true;
    lastError = null;
    throw new ApiError('Backend unavailable — network request failed.', { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

export async function login(payload) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function getCurrentUser() {
  return request('/auth/me');
}

export async function changePassword(payload) {
  return request('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) });
}

const localKey = (name) => `${STORAGE}:${name}`;

function seedFor(name) {
  if (name === 'technology') return { ...sample.technology, updated_at: null };
  return sample[name].map((record, index) => ({ ...record, id: -(index + 1), source: 'sample' }));
}

function readLocal(name) {
  try {
    const stored = localStorage.getItem(localKey(name));
    if (stored) return JSON.parse(stored);
  } catch {
    return seedFor(name);
  }
  const seeded = seedFor(name);
  writeLocal(name, seeded);
  return seeded;
}

function writeLocal(name, data) {
  try {
    localStorage.setItem(localKey(name), JSON.stringify(data));
  } catch {
    return;
  }
}

function mergeLocalRecords(name, remote) {
  const remoteRecords = normaliseRecords(remote);
  const local = readLocal(name).filter((record) => record.source === 'user' && record.id < 0);
  if (!local.length) return remoteRecords;
  const remoteIds = new Set(remoteRecords.map((record) => String(record?.id)));
  return [...local.filter((record) => !remoteIds.has(String(record?.id))), ...remoteRecords];
}

export async function list(name) {
  try {
    const data = await request(PATHS[name] || `/${name}`);
    offline = false;
    const merged = mergeLocalRecords(name, data);
    writeLocal(name, merged);
    return merged;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
    return normaliseRecords(readLocal(name));
  }
}

export async function create(name, payload) {
  try {
    const record = await request(PATHS[name], { method: 'POST', body: JSON.stringify(payload) });
    offline = false;
    const data = [record, ...readLocal(name).filter((item) => item.id !== record.id)];
    writeLocal(name, data);
    return record;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
    const record = { ...payload, id: -Date.now(), source: 'user' };
    writeLocal(name, [record, ...readLocal(name)]);
    return record;
  }
}

export async function remove(name, id) {
  try {
    await request(`${PATHS[name]}/${id}`, { method: 'DELETE' });
    offline = false;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
  }
  writeLocal(name, readLocal(name).filter((record) => record.id !== id));
}

export async function patch(name, id, payload) {
  try {
    const record = await request(`${PATHS[name]}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    offline = false;
    writeLocal(name, readLocal(name).map((item) => item.id === id ? record : item));
    return record;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
    const record = { ...readLocal(name).find((item) => item.id === id), ...payload };
    writeLocal(name, readLocal(name).map((item) => item.id === id ? record : item));
    return record;
  }
}

export async function getSettings() {
  try {
    const data = await request('/technology');
    offline = false;
    writeLocal('technology', data);
    return data;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
    return readLocal('technology');
  }
}

export async function saveSettings(payload) {
  try {
    const data = await request('/technology', { method: 'PUT', body: JSON.stringify(payload) });
    offline = false;
    writeLocal('technology', data);
    return data;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    offline = true;
    const data = { ...payload, updated_at: new Date().toISOString() };
    writeLocal('technology', data);
    return data;
  }
}

export async function getComplianceReconciliation(params = {}) {
  const query = new URLSearchParams();
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.opening_stock_kg !== '' && params.opening_stock_kg !== undefined && params.opening_stock_kg !== null) {
    query.set('opening_stock_kg', params.opening_stock_kg);
  }
  const suffix = query.toString() ? `?${query}` : '';
  return request(`/compliance/reconciliation${suffix}`);
}

function reportQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.report_type) query.set('report_type', params.report_type);
  return query.toString() ? `?${query.toString()}` : '';
}

export async function reportData(params = {}) {
  try {
    const snapshot = await request(`/reports/data${reportQuery(params)}`);
    return {
      ...snapshot,
      generation: snapshot.generation || [],
      characterisation: snapshot.characterisation || [],
      handling: snapshot.handling || [],
      disposal: snapshot.disposals || snapshot.disposal || [],
      disposals: snapshot.disposals || snapshot.disposal || [],
      compliance: snapshot.compliance || [],
      technology: snapshot.technology || seedFor('technology'),
      generated_at: snapshot.generated_at || new Date().toISOString(),
      period: snapshot.period || { date_from: params.date_from || null, date_to: params.date_to || null },
      report_type: snapshot.report_type || params.report_type || 'full',
    };
  } catch (error) {
    if (!isOfflineError(error) && error.status !== 404) throw error;
    const [generation, characterisation, handling, disposal, compliance, technology] = await Promise.all([
      list('generation'), list('lab'), list('handling'), list('consignments'), list('compliance'), getSettings(),
    ]);
    return {
      generation, characterisation, handling, disposal, disposals: disposal, compliance, technology,
      generated_at: new Date().toISOString(),
      period: { date_from: params.date_from || null, date_to: params.date_to || null },
      report_type: params.report_type || 'full',
    };
  }
}

async function downloadReportFile(path, filename) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${BASE}${path}`, { signal: controller.signal, headers });
    if (!response.ok) {
      let body = null;
      try { body = await response.json(); } catch {}
      throw new ApiError(detailFrom(body, `Request failed (${response.status})`), { status: response.status, kind: response.status === 401 ? 'auth' : response.status === 403 ? 'authorization' : 'request', detail: detailFrom(body, '') });
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    clearTimeout(timer);
  }
}

export async function exportReportCsv(params = {}) {
  const rt = params.report_type || 'full';
  return downloadReportFile(`/reports/export/csv${reportQuery(params)}`, `sludge-smart-${rt}-report.csv`);
}

export async function exportReportPdf(params = {}) {
  const rt = params.report_type || 'full';
  return downloadReportFile(`/reports/export/pdf${reportQuery(params)}`, `sludge-smart-${rt}-report.pdf`);
}
