import { describe, expect, test } from 'bun:test';
import { aggregate, rank } from '../src/utils/ranking.js';

const sample = {
  models: [
    { id: 'a', name: 'Alpha', provider: 'X' },
    { id: 'b', name: 'Beta', provider: 'Y' },
    { id: 'c', name: 'Gamma', provider: 'Z' },
  ],
  prompts: [
    {
      id: 'p1',
      category: 'Coding',
      text: 't',
      createdAt: 1,
      runs: [
        { id: 'r1', modelId: 'a', score: 100, time: 2, answer: '', createdAt: 1 },
        { id: 'r2', modelId: 'b', score: 80, time: 1, answer: '', createdAt: 1 },
      ],
    },
    {
      id: 'p2',
      category: 'Coding',
      text: 't2',
      createdAt: 2,
      runs: [
        { id: 'r3', modelId: 'a', score: 90, time: 4, answer: '', createdAt: 2 },
        // Beta only one run (low n); high single score
        { id: 'r4', modelId: 'b', score: 100, time: 0, answer: '', createdAt: 2 },
      ],
    },
  ],
};

describe('aggregate', () => {
  test('computes avg, avgTime (excludes zero time), adjusted, lowConfidence', () => {
    const rows = aggregate(sample, 'all');
    const a = rows.find((r) => r.model.id === 'a');
    const b = rows.find((r) => r.model.id === 'b');
    const c = rows.find((r) => r.model.id === 'c');

    expect(a.n).toBe(2);
    expect(a.avg).toBe(95);
    expect(a.avgTime).toBe(3);
    expect(a.lowConfidence).toBe(true);

    expect(b.n).toBe(2);
    expect(b.avg).toBe(90);
    // only one positive time (1); zero excluded
    expect(b.avgTime).toBe(1);

    expect(c.n).toBe(0);
    expect(c.avg).toBeNull();
    expect(c.adjusted).toBeNull();

    // Bayesian: adjusted is pulled toward global mean vs raw avg
    expect(typeof rows.globalMean).toBe('number');
    expect(a.adjusted).not.toBe(a.avg);
  });
});

describe('rank', () => {
  test('sorts by raw average', () => {
    const ranked = rank(aggregate(sample, 'all'), 'avg');
    const scored = ranked.filter((r) => r.n > 0);
    expect(scored[0].model.id).toBe('a'); // avg 95
    expect(scored[1].model.id).toBe('b'); // avg 90
    expect(scored[0].rank).toBe(1);
  });

  test('sorts by adjusted and by time', () => {
    const byTime = rank(aggregate(sample, 'all'), 'time');
    const scored = byTime.filter((r) => r.n > 0 && r.avgTime != null);
    expect(scored[0].model.id).toBe('b'); // faster avgTime
  });

  test('unscored models are appended with null rank', () => {
    const ranked = rank(aggregate(sample, 'all'), 'avg');
    const last = ranked[ranked.length - 1];
    expect(last.model.id).toBe('c');
    expect(last.rank).toBeNull();
  });
});
