import { clearApiCache } from './apiCache';

function getToken() {
  return window.__ACCESS_TOKEN__;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` }
  });
  if (res.status === 401) {
    // Sessions last 90 days; a 401 means it genuinely expired
    localStorage.removeItem('spendlens_token');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(url, data) {
  const result = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  // Any write can invalidate cached GET responses (summaries, budgets, etc.)
  clearApiCache();
  return result;
}

export function fetchSummary(month, viewBy = 'billing') {
  return apiFetch(`/api/summary?month=${month}&viewBy=${viewBy}`);
}

export function fetchTransactions(month, viewBy = 'billing') {
  return apiFetch(`/api/transactions?month=${month}&viewBy=${viewBy}`);
}

export function fetchBudget(month) {
  return apiFetch(`/api/budget?month=${month}`);
}

export function saveBudget(month, data) {
  return postJson('/api/budget', { month, ...data });
}

export function fetchSyncState() {
  return apiFetch('/api/syncstate');
}

export function triggerSync(params = {}) {
  return postJson('/api/sync', params);
}

export function fetchConfig() {
  return apiFetch('/api/config');
}

export function saveConfig(data) {
  return postJson('/api/config', data);
}

export function updateTransaction(emailId, changes) {
  return postJson('/api/transactions/update', { emailId, ...changes });
}

export function fetchRetirement() {
  return apiFetch('/api/retirement');
}

export function saveRetirement(data) {
  return postJson('/api/retirement', data);
}

export function saveRetirementSnapshot(snapshot) {
  return postJson('/api/retirement/snapshot', snapshot);
}

export function triggerSetup(data) {
  return postJson('/api/setup', data);
}
