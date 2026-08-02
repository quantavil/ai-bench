import { describe, expect, test } from 'bun:test';
import { renderIntelligenceCostChart, renderIntelligenceTimelineChart } from '../src/charts/svgCharts.js';

// Pull the dot label out of each rendered tooltip, in render order.
const titles = (html) => [...html.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]);
// Names of the dots flagged as frontier / SOTA members.
const leads = (html) => [...html.matchAll(/plot-dot--lead"[\s\S]*?<b>([^<(]*)/g)].map((m) => m[1].trim());

describe('renderIntelligenceCostChart', () => {
  test('returns fallback message when model array is empty or lacks intelligence index', () => {
    expect(renderIntelligenceCostChart([])).toContain('none have intelligence data');

    const html = renderIntelligenceCostChart([
      { id: 'm1', name: 'Model 1', provider: 'OpenAI', intelligence: null, price1mInput: 1.0, price1mOutput: 2.0 }
    ]);
    expect(html).toContain('none have intelligence data');
  });

  test('renders chart html with pareto efficiency frontier line for models with intelligence index', () => {
    const models = [
      { id: 'm1', name: 'Model A', provider: 'OpenAI', intelligence: 80, price1mInput: 1.0, price1mOutput: 3.0 }, // blended = 1.5
      { id: 'm2', name: 'Model B', provider: 'Anthropic', intelligence: 90, price1mInput: 5.0, price1mOutput: 15.0 }, // blended = 7.5
      { id: 'm3', name: 'Model C', provider: 'Google', intelligence: 75, price1mInput: 2.0, price1mOutput: 6.0 }, // blended = 3.0 (dominated)
      { id: 'm4', name: 'Model D', provider: 'Meta', intelligence: 82, price1mInput: null, price1mOutput: null }, // unpriced model, still included!
    ];

    const html = renderIntelligenceCostChart(models);
    expect(html).toContain('Intelligence Index');
    expect(html).toContain('Cost per 1M tokens ($, log scale)');
    expect(html).toContain('Efficiency frontier');
    expect(html).toContain('Unpriced');
    for (const name of ['Model A', 'Model B', 'Model C', 'Model D']) {
      expect(html).toContain(name);
    }
  });

  // The frontier sweep replaced an O(n^2) pairwise scan; this pins its result.
  test('frontier keeps only non-dominated models', () => {
    const models = [
      { id: 'cheap', name: 'Cheap', provider: 'OpenAI', intelligence: 60, price1mInput: 1, price1mOutput: 1 },
      { id: 'mid', name: 'Mid', provider: 'Google', intelligence: 55, price1mInput: 4, price1mOutput: 4 }, // dominated by Cheap
      { id: 'smart', name: 'Smart', provider: 'Anthropic', intelligence: 90, price1mInput: 9, price1mOutput: 9 },
      { id: 'waste', name: 'Waste', provider: 'Meta', intelligence: 70, price1mInput: 20, price1mOutput: 20 }, // dominated by Smart
    ];

    expect(leads(renderIntelligenceCostChart(models)).sort()).toEqual(['Cheap', 'Smart']);
  });
});

describe('renderIntelligenceTimelineChart', () => {
  test('returns fallback message when model array is empty or lacks release dates', () => {
    expect(renderIntelligenceTimelineChart([])).toContain('none have release dates');

    const html = renderIntelligenceTimelineChart([
      { id: 'm1', name: 'Model 1', provider: 'OpenAI', intelligence: 80, releasedAt: null }
    ]);
    expect(html).toContain('none have release dates');
  });

  test('renders timeline chart html with SOTA progression line for models with intelligence and release dates', () => {
    const models = [
      { id: 'm1', name: 'GPT-4', provider: 'OpenAI', intelligence: 70, releasedAt: '2023-03-14' },
      { id: 'm2', name: 'Claude 3 Opus', provider: 'Anthropic', intelligence: 78, releasedAt: '2024-03-04' },
      { id: 'm3', name: 'Gemini 1.5 Pro', provider: 'Google', intelligence: 76, releasedAt: '2024-02-15' },
      { id: 'm4', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', intelligence: 88, releasedAt: '2024-06-20' },
    ];

    const html = renderIntelligenceTimelineChart(models);
    expect(html).toContain('Intelligence Index');
    expect(html).toContain('Release date');
    expect(html).toContain('SOTA progression');

    // Dots come out oldest-first, and only each new record counts as SOTA.
    expect(titles(html)).toEqual([
      'GPT-4 (OpenAI)',
      'Gemini 1.5 Pro (Google)',
      'Claude 3 Opus (Anthropic)',
      'Claude 3.5 Sonnet (Anthropic)',
    ]);
    expect(leads(html)).toEqual(['GPT-4', 'Gemini 1.5 Pro', 'Claude 3 Opus', 'Claude 3.5 Sonnet']);
  });

  test('tolerates year-only and year-month release dates', () => {
    const models = [
      { id: 'a', name: 'Old', provider: 'OpenAI', intelligence: 40, releasedAt: '2023' },
      { id: 'b', name: 'Newer', provider: 'Google', intelligence: 60, releasedAt: '2024-06' },
    ];
    expect(titles(renderIntelligenceTimelineChart(models))).toEqual(['Old (OpenAI)', 'Newer (Google)']);
  });
});
