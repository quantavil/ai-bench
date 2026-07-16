/**
 * Cloudflare Pages Function - /api/data
 * GET  -> returns dataset JSON from KV.
 * POST -> validates and stores dataset in KV, guarded by version check.
 */

import { json, validateDataset, readStored, readJsonBody, KV_KEY } from './_shared.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.BENCH_KV) return json({ error: 'Server not configured: BENCH_KV is not bound.' }, 500);

  if (request.method === 'GET') {
    try {
      return json(await readStored(env));
    } catch {
      return json({ error: 'Stored dataset is corrupted. Inspect the KV value manually.' }, 500);
    }
  }

  if (request.method === 'POST') {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const result = validateDataset(parsed.data);
    if (!result.ok) return json({ error: result.error }, 400);

    const clientVersion = Number(parsed.data.version);
    if (!Number.isInteger(clientVersion) || clientVersion < 0) {
      return json({ error: 'Missing or invalid version.' }, 400);
    }

    let current;
    try { current = await readStored(env); }
    catch { return json({ error: 'Stored dataset is corrupted. Inspect the KV value manually.' }, 500); }

    const currentVersion = Number(current.version) || 0;
    if (clientVersion !== currentVersion) {
      // Another device wrote since this client loaded.
      return json({ error: 'Version conflict: data changed elsewhere.', version: currentVersion }, 409);
    }

    const newVersion = currentVersion + 1;
    await env.BENCH_KV.put(KV_KEY, JSON.stringify({ version: newVersion, ...result.data }));
    return json({ ok: true, version: newVersion });
  }

  return json({ error: 'Method not allowed.' }, 405);
}
