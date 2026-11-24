import sample from '../../shared/sample-data.json';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const STORAGE = 'sludge-smart:v1';

const PATHS = {
  generation: '/generation',
  lab: '/characterisation',
  handling: '/handling',
  disposal: '/disposals',
  compliance: '/compliance',
};

let offline = false;
export const isOffline = () => offline;

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
    /* corrupted local cache — fall through to sample data */
  }
  const seeded = seedFor(name);
  writeLocal(name, seeded);
  return seeded;
}

function writeLocal(name, data) {
  try {
    localStorage.setItem(localKey(name), JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / quota) */
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        message = body.detail || message;
      } catch {
        /* keep default */
      }
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }
    return response.status === 204 ? null : await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mergeLocalRecords(name, remote) {
  const local = readLocal(name).filter((record) => record.source === 'user' && record.id < 0);
  if (!local.length) return remote;
  const remoteIds = new Set(remote.map((record) => String(record.id)));
  return [...local.filter((record) => !remoteIds.has(String(record.id))), ...remote];
}

export async function list(name) {
  try {
    const data = await request(PATHS[name] || `/${name}`);
    offline = false;
    const merged = mergeLocalRecords(name, data);
    writeLocal(name, merged);
    return merged;
  } catch {
    offline = true;
    return readLocal(name);
  }
}

export async function create(name, payload) {
  try {
    const record = await request(PATHS[name], { method: 'POST', body: JSON.stringify(payload) });
    offline = false;
    const data = mergeLocalRecords(name, await list(name));
    writeLocal(name, data);
    return record;
  } catch (error) {
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
  } catch {
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
  } catch {
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
  } catch {
    offline = true;
    const data = { ...payload, updated_at: new Date().toISOString() };
    writeLocal('technology', data);
    return data;
  }
}

export async function reportData() {
  const [generation, characterisation, handling, disposal, compliance, technology] = await Promise.all([
    list('generation'), list('lab'), list('handling'), list('disposal'), list('compliance'), getSettings(),
  ]);
  return {
    generation, characterisation, handling, disposal, compliance, technology,
    generated_at: new Date().toISOString(),
  };
}
