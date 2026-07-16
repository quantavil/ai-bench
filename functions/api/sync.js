/**
 * Cloudflare Pages Function - /api/sync
 * POST -> Fetches models from Artificial Analysis, filters top 100 by intelligence index,
 *        updates models in KV dataset, prunes obsolete model runs, and returns new dataset.
 *
 * Body: { version, apiKey } — apiKey is required (user-supplied from Settings; never hardcoded).
 */

import {
  json,
  cleanId,
  readStored,
  validateDataset,
  KV_KEY,
  AA_MODELS_URL,
} from './_shared.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.BENCH_KV) {
    return json({ error: 'Server not configured: BENCH_KV is not bound.' }, 500);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body is not valid JSON.' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return json({
      error: 'Artificial Analysis API key is required. Set it in Settings.',
    }, 400);
  }

  let clientVersion = null;
  if (body.version !== undefined) {
    clientVersion = Number(body.version);
    if (!Number.isInteger(clientVersion) || clientVersion < 0) {
      return json({ error: 'Missing or invalid version.' }, 400);
    }
  }

  try {
    let allRecords = [];
    let page = 1;
    let hasMore = true;

    // Fetch pages recursively (up to 10 pages maximum to avoid timeouts)
    while (hasMore && page <= 10) {
      const pageUrl = page === 1 ? AA_MODELS_URL : `${AA_MODELS_URL}?page=${page}`;
      const res = await fetch(pageUrl, {
        headers: {
          'x-api-key': apiKey,
          accept: 'application/json',
        },
      });

      if (res.status === 401 || res.status === 403) {
        return json({ error: 'API key rejected by Artificial Analysis.' }, 401);
      }

      if (!res.ok) {
        throw new Error(`Artificial Analysis API returned HTTP ${res.status}`);
      }

      const pageBody = await res.json();
      let records = [];

      if (Array.isArray(pageBody)) {
        records = pageBody;
      } else if (pageBody && typeof pageBody === 'object') {
        for (const key of ['data', 'models', 'results', 'items']) {
          if (Array.isArray(pageBody[key])) {
            records = pageBody[key];
            break;
          }
        }
      }

      if (records.length === 0) {
        hasMore = false;
      } else {
        allRecords.push(...records);

        const meta = pageBody.meta || pageBody.pagination || pageBody;
        const totalPagesVal = meta.total_pages || meta.totalPages || meta.pages;
        if (totalPagesVal && page < Number(totalPagesVal)) {
          page++;
        } else {
          hasMore = false;
        }
      }
    }

    if (allRecords.length === 0) {
      return json({ error: 'No models found in Artificial Analysis response.' }, 500);
    }

    // Process and normalize
    const processedModels = allRecords.map(m => {
      let idSrc = m.slug || m.id || m.name || '';
      idSrc = idSrc.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const id = cleanId(idSrc);

      const name = typeof m.name === 'string' ? m.name.slice(0, 200).trim() : 'Unknown Model';
      const provider = typeof (m.model_creator?.name || m.creator) === 'string'
        ? String(m.model_creator?.name || m.creator).slice(0, 200).trim()
        : 'Unknown';

      const releasedAt = typeof m.release_date === 'string' ? m.release_date.slice(0, 20) : null;

      const rawPriceInput = m.pricing?.price_1m_input_tokens;
      const rawPriceOutput = m.pricing?.price_1m_output_tokens;
      const price1mInput = typeof rawPriceInput === 'number' ? Math.round(rawPriceInput * 100) / 100 : null;
      const price1mOutput = typeof rawPriceOutput === 'number' ? Math.round(rawPriceOutput * 100) / 100 : null;

      const intelligence = typeof m.evaluations?.artificial_analysis_intelligence_index === 'number'
        ? m.evaluations.artificial_analysis_intelligence_index
        : null;

      return {
        id,
        name,
        provider,
        releasedAt,
        price1mInput,
        price1mOutput,
        intelligence,
      };
    }).filter(m => m.id && m.intelligence !== null);

    const seenIds = new Set();
    const uniqueModels = [];
    for (const m of processedModels) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueModels.push(m);
      }
    }

    uniqueModels.sort((a, b) => b.intelligence - a.intelligence);
    const top100 = uniqueModels.slice(0, 100);

    if (top100.length === 0) {
      return json({ error: 'No models with valid intelligence index found.' }, 500);
    }

    // Fail closed: never treat a read error as an empty dataset (would wipe prompts/runs).
    let dataset;
    try {
      dataset = await readStored(env);
    } catch {
      return json({
        error: 'Stored dataset is corrupted or unreadable. Inspect the KV value manually before syncing.',
      }, 500);
    }

    if (clientVersion !== null) {
      const currentVersion = Number(dataset.version) || 0;
      if (clientVersion !== currentVersion) {
        return json({ error: 'Version conflict: data changed elsewhere.', version: currentVersion }, 409);
      }
    }

    const nextVersion = (Number(dataset.version) || 0) + 1;

    const referenced = new Set();
    if (Array.isArray(dataset.prompts)) {
      for (const p of dataset.prompts) {
        for (const r of (p.runs || [])) {
          referenced.add(r.modelId);
        }
      }
    }

    const keep = new Map(top100.map(m => [m.id, m]));
    if (Array.isArray(dataset.models)) {
      for (const m of dataset.models) {
        if (referenced.has(m.id) && !keep.has(m.id)) {
          keep.set(m.id, m);
        }
      }
    }
    dataset.models = [...keep.values()];
    dataset.lastSyncedAt = Date.now();
    dataset.version = nextVersion;

    const result = validateDataset(dataset);
    if (!result.ok) {
      return json({ error: `Validation failed: ${result.error}` }, 400);
    }

    await env.BENCH_KV.put(KV_KEY, JSON.stringify({ version: nextVersion, ...result.data }));

    return json({
      ok: true,
      version: nextVersion,
      models: result.data.models,
      prompts: result.data.prompts,
      lastSyncedAt: result.data.lastSyncedAt,
    });
  } catch (err) {
    return json({ error: `Sync failed: ${err.message}` }, 500);
  }
}
