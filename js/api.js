/* Talks to api/index.php. Errors carry the server's error code. */
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(route, body, query = {}) {
  const params = new URLSearchParams({ r: route, ...query });
  const options = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`api/index.php?${params}`, options);
  } catch {
    throw new ApiError('offline', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data || data.error) throw new ApiError(data?.error || 'server_error', res.status);
  return data;
}
