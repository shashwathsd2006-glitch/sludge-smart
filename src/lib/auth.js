const TOKEN_KEY = 'sludge-smart:v1:auth:token';
const USER_KEY = 'sludge-smart:v1:auth:user';

let token = null;
let user = null;
let reason = '';
const listeners = new Set();

function storage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function persist() {
  const store = storage();
  if (!store) return;
  if (token) store.setItem(TOKEN_KEY, token);
  else store.removeItem(TOKEN_KEY);
  if (user) store.setItem(USER_KEY, JSON.stringify(user));
  else store.removeItem(USER_KEY);
}

function emit() {
  const snapshot = { token, user };
  listeners.forEach((listener) => listener(snapshot, reason));
}

export function initSession() {
  const store = storage();
  if (!store) return;
  token = store.getItem(TOKEN_KEY);
  const storedUser = store.getItem(USER_KEY);
  if (storedUser) {
    try {
      user = JSON.parse(storedUser);
    } catch {
      user = null;
      store.removeItem(USER_KEY);
    }
  }
  if (!token) user = null;
}

initSession();

export function getSession() {
  return { token, user };
}

export function getToken() {
  return token;
}

export function getUser() {
  return user;
}

export function getReason() {
  return reason;
}

export function setSession(next) {
  token = next.token || null;
  user = next.user || null;
  reason = '';
  persist();
  emit();
}

export function setUser(nextUser, nextReason = '') {
  user = nextUser || null;
  reason = nextReason;
  persist();
  emit();
}

export function clearSession(nextReason = 'signed-out') {
  token = null;
  user = null;
  reason = nextReason;
  persist();
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
