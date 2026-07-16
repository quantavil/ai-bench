// Pure functions: no Alpine, no DOM. Given the dataset and a filter, produce
// the ranked rows the leaderboard and models table render.

import { SHRINKAGE_C, LOW_CONFIDENCE_N } from './config.js';

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// Group every run by model id, honouring the category filter.
function groupRuns(data, category) {
  const runs = data.prompts
    .filter((p) => category === 'all' || p.category === category)
    .flatMap((p) => p.runs);
  return Map.groupBy(runs, (r) => r.modelId);
}

// Returns one row per model: { model, n, avg, avgTime, adjusted, lowConfidence }.
// Models with no runs in the current filter get null metrics.
export function aggregate(data, category = 'all') {
  const groups = groupRuns(data, category);

  let scoreSumTotal = 0;
  let scoreCountTotal = 0;
  for (const runs of groups.values()) {
    for (const r of runs) {
      scoreSumTotal += r.score;
      scoreCountTotal++;
    }
  }
  const globalMean = scoreCountTotal > 0 ? (scoreSumTotal / scoreCountTotal) : 0;

  const rows = data.models.map((model) => {
    const runs = groups.get(model.id) || [];
    const n = runs.length;
    if (n === 0) {
      return { model, n: 0, avg: null, avgTime: null, adjusted: null, lowConfidence: false };
    }
    
    let scoreSum = 0;
    let timeSum = 0;
    let timeCount = 0;
    for (const r of runs) {
      scoreSum += r.score;
      if (r.time > 0) {
        timeSum += r.time;
        timeCount++;
      }
    }
    const avg = scoreSum / n;
    const avgTime = timeCount > 0 ? timeSum / timeCount : null;
    const adjusted = (SHRINKAGE_C * globalMean + n * avg) / (SHRINKAGE_C + n);
    return { model, n, avg, avgTime, adjusted, lowConfidence: n < LOW_CONFIDENCE_N };
  });
  rows.globalMean = globalMean;
  return rows;
}

// Sorts aggregated rows. Scored rows first (ranked), unscored appended by name.
export function rank(rows, sortMode = 'adjusted') {
  const scored = rows.filter((r) => r.n > 0);
  const unscored = rows.filter((r) => r.n === 0);

  const byName = (a, b) => a.model.name.localeCompare(b.model.name);

  scored.sort((a, b) => {
    switch (sortMode) {
      case 'time':
        if (a.avgTime === null && b.avgTime === null) return b.adjusted - a.adjusted || byName(a, b);
        if (a.avgTime === null) return 1;
        if (b.avgTime === null) return -1;
        return a.avgTime - b.avgTime || b.adjusted - a.adjusted || byName(a, b);
      case 'count':
        return b.n - a.n || b.adjusted - a.adjusted || byName(a, b);
      case 'avg':
        return b.avg - a.avg || b.n - a.n || byName(a, b);
      case 'adjusted':
      default:
        return b.adjusted - a.adjusted || b.n - a.n || byName(a, b);
    }
  });

  scored.forEach((r, i) => { r.rank = i + 1; });
  unscored.sort(byName).forEach((r) => { r.rank = null; });

  return [...scored, ...unscored];
}

// Categories that actually appear in the data, in CATEGORIES order upstream.
export function categoriesInUse(data) {
  const set = new Set();
  for (const p of data.prompts) set.add(p.category);
  return set;
}

export function totalRuns(data) {
  return data.prompts.reduce((s, p) => s + p.runs.length, 0);
}
