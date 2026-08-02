import { test, expect, beforeEach } from 'bun:test';
import { bench } from '../src/store/appStore.js';

test('bench store initial state', () => {
  const store = bench();
  expect(store.data.models).toEqual([]);
  expect(store.data.prompts).toEqual([]);
  expect(store.loading).toBe(true);
});

test('bench store normalise payload and pagination', () => {
  const store = bench();
  const rawData = {
    version: 1,
    models: [
      { id: 'm1', name: 'Model 1', provider: 'Provider A', intelligence: 85, price1mInput: 0, price1mOutput: 0 },
      { id: 'm2', name: 'Model 2', provider: 'Provider B', intelligence: 90, price1mInput: 1.5, price1mOutput: 3.0 }
    ],
    prompts: [
      { id: 'p1', text: 'Test prompt', category: 'Reasoning', createdAt: Date.now(), runs: [] }
    ]
  };

  store.applyData(rawData);
  expect(store.data.models.length).toBe(2);
  expect(store.data.prompts.length).toBe(1);
  expect(store.paginatedModels.length).toBe(2);
  expect(store.rankedModelsByIntelligence[0].model.id).toBe('m2');
});

test('bench store price filtering for free models', () => {
  const store = bench();
  const rawData = {
    version: 1,
    models: [
      { id: 'free-m', name: 'Free Model', provider: 'OpenSource', intelligence: 70, price1mInput: 0, price1mOutput: 0 },
      { id: 'paid-m', name: 'Paid Model', provider: 'CloudProvider', intelligence: 95, price1mInput: 5.0, price1mOutput: 15.0 }
    ],
    prompts: []
  };

  store.applyData(rawData);

  // The models tab is served from a cache that init() refreshes via a $watch on
  // modelFilterKey. There is no Alpine here, so assert the key actually covers
  // this filter, then run the recompute the watcher would have run.
  const before = store.modelFilterKey;
  store.selectedPriceRange = 'free';
  expect(store.modelFilterKey).not.toBe(before);
  store.updateModelRows();

  const freeModels = store.rankedModelsByIntelligence;
  expect(freeModels.length).toBe(1);
  expect(freeModels[0].model.id).toBe('free-m');
});
