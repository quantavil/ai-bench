export const KV_KEY = 'dataset';

export const LIMITS = {
  maxModels: 500,
  maxPrompts: 2000,
  maxRunsPerPrompt: 500,
  maxNameLen: 200,
  maxProviderLen: 200,
  maxCategoryLen: 40,
  maxPromptLen: 8000,
  maxAnswerLen: 50000,
  maxBodyBytes: 8 * 1024 * 1024, // 8 MB
};

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function cleanString(value, maxLen) {
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLen);
}

export function isValidCharset(value) {
  if (typeof value !== 'string') return false;
  return /^[a-zA-Z0-9\s._\(\)\-\[\]#+&:/]*$/.test(value);
}

export function cleanId(value) {
  const s = cleanString(value, 64);
  if (!s || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

import { z } from 'zod';

const IdSchema = z.string().max(64).regex(/^[A-Za-z0-9_-]+$/);

const ModelSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(LIMITS.maxNameLen),
  provider: z.string().trim().min(1).max(LIMITS.maxProviderLen),
  releasedAt: z.string().trim().max(20).nullable().optional().default(null),
  price1mInput: z.number().nullable().optional().default(null),
  price1mOutput: z.number().nullable().optional().default(null),
  intelligence: z.number().nullable().optional().default(null),
});

const RunSchema = z.object({
  id: IdSchema,
  modelId: IdSchema,
  score: z.number().min(0).max(100).transform(s => Math.round(s * 100) / 100),
  time: z.number().min(0).transform(t => Math.round(t * 1000) / 1000),
  answer: z.string().max(LIMITS.maxAnswerLen).optional().default(''),
  createdAt: z.number().min(0).optional().default(() => Date.now()),
});

const PromptSchema = z.object({
  id: IdSchema,
  text: z.string().trim().min(1).max(LIMITS.maxPromptLen),
  category: z.string().trim().max(LIMITS.maxCategoryLen).refine(isValidCharset).default('Other'),
  createdAt: z.number().min(0).optional().default(() => Date.now()),
  runs: z.array(RunSchema).max(LIMITS.maxRunsPerPrompt),
});

const DatasetSchema = z.object({
  models: z.array(ModelSchema).max(LIMITS.maxModels),
  prompts: z.array(PromptSchema).max(LIMITS.maxPrompts),
  lastSyncedAt: z.number().nullable().optional().default(null),
}).superRefine((data, ctx) => {
  const modelIds = new Set();
  data.models.forEach((m, idx) => {
    if (modelIds.has(m.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate model id "${m.id}".`,
        path: ['models', idx, 'id'],
      });
    }
    modelIds.add(m.id);
  });

  const promptIds = new Set();
  data.prompts.forEach((p, pIdx) => {
    if (promptIds.has(p.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate prompt id "${p.id}".`,
        path: ['prompts', pIdx, 'id'],
      });
    }
    promptIds.add(p.id);

    const runIds = new Set();
    const runModelIds = new Set();
    p.runs.forEach((r, rIdx) => {
      if (runIds.has(r.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate run id in prompt "${p.id}".`,
          path: ['prompts', pIdx, 'runs', rIdx, 'id'],
        });
      }
      runIds.add(r.id);

      if (!modelIds.has(r.modelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A run in prompt "${p.id}" references an unknown model.`,
          path: ['prompts', pIdx, 'runs', rIdx, 'modelId'],
        });
      }

      if (runModelIds.has(r.modelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Prompt "${p.id}" has two runs for the same model.`,
          path: ['prompts', pIdx, 'runs', rIdx, 'modelId'],
        });
      }
      runModelIds.add(r.modelId);
    });
  });
});

// Validate + normalise. Returns { ok, data | error }. data has models, prompts, lastSyncedAt.
export function validateDataset(body) {
  const result = DatasetSchema.safeParse(body);
  if (!result.success) {
    const error = result.error.issues[0]?.message || 'Invalid dataset payload.';
    return { ok: false, error };
  }
  return { ok: true, data: result.data };
}

export async function readStored(env) {
  const raw = await env.BENCH_KV.get(KV_KEY);
  if (!raw) return { version: 0, models: [], prompts: [], lastSyncedAt: null };
  return JSON.parse(raw);
}

/** Parse JSON body with a hard byte-size cap (actual body, not Content-Length header). */
export async function readJsonBody(request, maxBytes = LIMITS.maxBodyBytes) {
  const raw = await request.text();
  const byteLen = new TextEncoder().encode(raw).length;
  if (byteLen > maxBytes) {
    return { ok: false, error: 'Payload too large.', status: 413 };
  }
  if (!raw.trim()) {
    return { ok: false, error: 'Request body is empty.', status: 400 };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'Request body is not valid JSON.', status: 400 };
  }
}

export const AA_MODELS_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';

/** Probe Artificial Analysis with the given key (one lightweight request). */
export async function testAaApiKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) {
    return { ok: false, error: 'API key is required.', status: 400 };
  }
  const res = await fetch(AA_MODELS_URL, {
    headers: {
      'x-api-key': key,
      accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'API key rejected by Artificial Analysis.', status: 401 };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `Artificial Analysis API returned HTTP ${res.status}.`,
      status: 502,
    };
  }
  return { ok: true };
}
