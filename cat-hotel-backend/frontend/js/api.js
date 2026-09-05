// Thin fetch wrapper shared by every page. Centralizing this means the
// error-shape handling only needs to change in one place if the API
// response shape ever changes. The base URL itself lives in
// config.js (loaded before this file) so it can differ per deployment.
const API_BASE = window.CATNAP_API_BASE;

async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    // Always sent: the LINE Login session is an httpOnly cookie, so
    // every request (not just "auth" ones) needs credentials included
    // for the backend to know who's asking.
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // 204 No Content and similar responses have no JSON body - that's fine.
  }

  if (!res.ok) {
    const message = data?.error?.message || `คำขอไม่สำเร็จ (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data?.error?.details;
    throw err;
  }

  return data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
};
