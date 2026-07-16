/**
 * Cloudflare Pages Function - /api/test-aa
 * POST -> { apiKey } probes Artificial Analysis with the user-supplied key.
 * Does not touch KV. Used by Settings "Test" button.
 */

import { json, testAaApiKey } from './_shared.js';

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body is not valid JSON.' }, 400);
  }

  const apiKey = body && typeof body === 'object' ? body.apiKey : null;

  try {
    const result = await testAaApiKey(apiKey);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status || 400);
    }
    return json({ ok: true, message: 'API key works.' });
  } catch (err) {
    return json({ error: `Key test failed: ${err.message}` }, 500);
  }
}
