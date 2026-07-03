function getToken() {
  return window.__ACCESS_TOKEN__;
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

async function handleResponse(res) {
  if (res.status === 401) {
    localStorage.removeItem('spendlens_token');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSummary(month, viewBy = 'billing') {
  return handleResponse(await fetch(`/api/summary?month=${month}&viewBy=${viewBy}`, { headers: authHeaders() }));
}

export async function fetchTransactions(month, viewBy = 'billing') {
  return handleResponse(await fetch(`/api/transactions?month=${month}&viewBy=${viewBy}`, { headers: authHeaders() }));
}

export async function fetchBudget(month) {
  return handleResponse(await fetch(`/api/budget?month=${month}`, { headers: authHeaders() }));
}

export async function saveBudget(month, data) {
  return handleResponse(await fetch('/api/budget', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, ...data })
  }));
}

export async function fetchSyncState() {
  return handleResponse(await fetch('/api/syncstate', { headers: authHeaders() }));
}

export async function triggerSync(params = {}) {
  return handleResponse(await fetch('/api/sync', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }));
}

export async function fetchConfig() {
  return handleResponse(await fetch('/api/config', { headers: authHeaders() }));
}

export async function saveConfig(data) {
  return handleResponse(await fetch('/api/config', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }));
}

export async function triggerSetup(data) {
  return handleResponse(await fetch('/api/setup', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }));
}
