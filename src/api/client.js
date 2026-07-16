// Thin fetch layer over /api/data and /api/sync. Returns plain result objects
// so the store can decide how to react (version conflict, network error).

const ENDPOINT = '/api/data';

export async function loadData() {
  try {
    const res = await fetch(ENDPOINT);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } };
  }
}

// payload must include { version, models, prompts }.
// On success the server returns the new version number.
// On a stale write it returns 409 with the current server version.
export async function saveData(payload) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } };
  }
}

export async function syncModels(version, apiKey) {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, apiKey }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } };
  }
}

export async function testAaKey(apiKey) {
  try {
    const res = await fetch('/api/test-aa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'network' } };
  }
}
