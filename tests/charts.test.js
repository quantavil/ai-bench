import { describe, expect, test } from 'bun:test';
import { renderIntelligenceCostChart } from '../src/charts/svgCharts.js';

describe('renderIntelligenceCostChart', () => {
  test('returns fallback message when model array is empty or lacks intelligence index', () => {
    const html1 = renderIntelligenceCostChart([]);
    expect(html1).toContain('No models match your search query');

    const html2 = renderIntelligenceCostChart([
      { id: 'm1', name: 'Model 1', provider: 'OpenAI', intelligence: null, price1mInput: 1.0, price1mOutput: 2.0 }
    ]);
    expect(html2).toContain('No models match your search query');
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
    expect(html).toContain('Model A');
    expect(html).toContain('Model B');
    expect(html).toContain('Model C');
    expect(html).toContain('Model D');
    expect(html).toContain('Unpriced');
  });
});
