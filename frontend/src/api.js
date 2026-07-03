function getToken() {
  return window.__ACCESS_TOKEN__;
}

// Deduplicate concurrent refresh attempts across parallel API calls
let refreshPromise = null;
function tryRefreshToken() {
  if (typeof window.__REFRESH_TOKEN__ !== 'function') return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = window.__REFRESH_TOKEN__()
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function apiFetch(url, options = {}) {
  const doFetch = () => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` }
  });

  let res = await doFetch();
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) res = await doFetch();
  }
  if (res.status === 401) {
    localStorage.removeItem('spendlens_token');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function postJson(url, data) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
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
