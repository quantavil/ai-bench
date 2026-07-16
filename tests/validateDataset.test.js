import { describe, expect, test } from 'bun:test';
import { validateDataset } from '../functions/api/_shared.js';

const validBase = {
  models: [{ id: 'm1', name: 'Claude', provider: 'Anthropic' }],
  prompts: [{
    id: 'p1',
    text: 'Hello',
    category: 'Coding',
    createdAt: 1,
    runs: [{ id: 'r1', modelId: 'm1', score: 90, time: 1.5, answer: '', createdAt: 1 }],
  }],
  lastSyncedAt: null,
};

describe('validateDataset', () => {
  test('accepts a valid payload', () => {
    const result = validateDataset(validBase);
    expect(result.ok).toBe(true);
    expect(result.data.models[0].name).toBe('Claude');
  });

  test('rejects whitespace-only model name', () => {
    const result = validateDataset({
      ...validBase,
      models: [{ id: 'm1', name: '   ', provider: 'Anthropic' }],
      prompts: [],
    });
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });

  test('rejects whitespace-only prompt text', () => {
    const result = validateDataset({
      models: [{ id: 'm1', name: 'Claude', provider: 'Anthropic' }],
      prompts: [{ id: 'p1', text: '  \t  ', category: 'Other', runs: [] }],
    });
    expect(result.ok).toBe(false);
  });

  test('rejects unknown modelId on a run (returns message, does not throw)', () => {
    const result = validateDataset({
      models: [{ id: 'm1', name: 'Claude', provider: 'Anthropic' }],
      prompts: [{
        id: 'p1',
        text: 'Hi',
        category: 'Other',
        runs: [{ id: 'r1', modelId: 'missing', score: 10, time: 0 }],
      }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown model');
  });

  test('rejects duplicate model-per-prompt runs', () => {
    const result = validateDataset({
      models: [{ id: 'm1', name: 'Claude', provider: 'Anthropic' }],
      prompts: [{
        id: 'p1',
        text: 'Hi',
        category: 'Other',
        runs: [
          { id: 'r1', modelId: 'm1', score: 10, time: 0 },
          { id: 'r2', modelId: 'm1', score: 20, time: 0 },
        ],
      }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('two runs');
  });

  test('trims model name and provider', () => {
    const result = validateDataset({
      models: [{ id: 'm1', name: '  Claude  ', provider: '  Anthropic  ' }],
      prompts: [],
    });
    expect(result.ok).toBe(true);
    expect(result.data.models[0].name).toBe('Claude');
    expect(result.data.models[0].provider).toBe('Anthropic');
  });
});
