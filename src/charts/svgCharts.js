// Renderers for the views that are too dense to bind element-by-element: the
// charts and the coverage grid. Each returns an HTML string that Alpine injects
// via x-html, so hundreds of dots or thousands of cells cost one parse instead
// of thousands of reactive effects.
//
// All presentation lives in index.css under .plot-* / .bar-* / .matrix-*, which
// keeps the generated markup small — it is re-parsed on every render.

import { providerColor } from '../utils/providers.js';
import { fmt1 } from '../utils/formatters.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

// ─── shared plot pieces ──────────────────────────────────────────────────────

// Nudge coincident points apart along a golden-angle spiral so none hides another.
function spread(points) {
  const seen = new Map();
  return points.map((p) => {
    const key = `${p.x.toFixed(1)}-${p.y.toFixed(1)}`;
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    if (!n) return p;
    const angle = n * 2.39996;
    const dist = 0.8 * Math.sqrt(n);
    return { ...p, x: clamp(p.x + Math.cos(angle) * dist), y: clamp(p.y + Math.sin(angle) * dist) };
  });
}

// `lead` marks a frontier/peak member, `faint` a low-confidence one.
function dot(p) {
  const cls = ['plot-dot', p.lead && 'plot-dot--lead', p.faint && 'plot-dot--faint'].filter(Boolean).join(' ');
  const tip = ['plot-tip', p.y > 74 && 'plot-tip--under', p.x < 15 && 'plot-tip--start', p.x > 85 && 'plot-tip--end']
    .filter(Boolean).join(' ');
  return `<div class="${cls}" style="left:${p.x.toFixed(2)}%;bottom:${p.y.toFixed(2)}%;--c:${p.color}" tabindex="0" role="img" aria-label="${esc(p.aria)}"><span class="${tip}"><b>${esc(p.title)}</b><i>${esc(p.sub)}</i></span></div>`;
}

// ticks are { pct, label }. Every other vertical tick is hidden on narrow screens.
const hGrid = (ticks) => ticks.map((t) => `<u class="grid-h" style="bottom:${t.pct}%"><span>${t.label}</span></u>`).join('');
const vGrid = (ticks) => ticks.map((t, i) => `<u class="grid-v${i % 2 ? ' grid-v--wide' : ''}" style="left:${t.pct}%"><span>${t.label}</span></u>`).join('');

const SCORE_TICKS = [0, 25, 50, 75, 100].map((v) => ({ pct: v, label: v }));

// A dashed polyline across the plot area in 0-100 space, plus a corner caption.
function trace(points, caption) {
  if (points.length < 2) return '';
  const pts = points.map((p) => `${p.x.toFixed(2)},${(100 - p.y).toFixed(2)}`).join(' ');
  return `<svg class="plot-trace" preserveAspectRatio="none" viewBox="0 0 100 100"><polyline points="${pts}"/></svg><span class="plot-note">${caption}</span>`;
}

// The frame every scatter-style chart shares.
function plot({ yLabel, xLabel, h, v, points, overlay = '' }) {
  const dots = spread(points).map(dot).join('');
  return `<div class="plot"><div class="plot-body"><span class="plot-ylabel">${yLabel}</span><div class="plot-area">${hGrid(h)}${vGrid(v)}${overlay}${dots}</div></div><span class="plot-xlabel">${xLabel}</span></div>`;
}

const empty = (msg) => `<p class="plot-empty">${msg}</p>`;

// Auto-scaled 0-100 axis padded to clean multiples of 5.
function scale(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || 10) * 0.12;
  let min = Math.floor((lo - pad) / 5) * 5;
  let max = Math.ceil((hi + pad) / 5) * 5;
  if (min === max) { min -= 5; max += 5; }
  min = Math.max(0, min);
  max = Math.min(100, max);
  const range = max - min;
  const step = range <= 20 ? 5 : range <= 50 ? 10 : 20;
  const ticks = [];
  for (let v = min; v <= max; v += step) ticks.push({ pct: ((v - min) / range) * 100, label: v });
  return { ticks, at: (v) => clamp(((v - min) / range) * 100) };
}

// ─── vertical bar chart ──────────────────────────────────────────────────────

export function renderBarChart(rows) {
  if (!rows.length) return '';

  const bars = rows.map((r) => {
    const pct = clamp(r.adjusted);
    const time = r.avgTime != null ? ` · ${fmt1(r.avgTime)}s avg` : '';
    const title = `${fmt1(r.adjusted)} adj · ${r.n} run${r.n === 1 ? '' : 's'}${time}${r.lowConfidence ? ' (low n)' : ''}`;
    return `<div class="bar-col" title="${esc(title)}"><span class="bar-val" style="bottom:calc(${pct}% + 6px)">${fmt1(r.adjusted)}</span><div class="bar${r.lowConfidence ? ' bar--faint' : ''}" style="height:${pct}%;--c:${providerColor(r.model.provider)}"></div><span class="bar-name" title="${esc(r.model.name)}">${esc(r.model.name)}</span></div>`;
  }).join('');

  return `<div class="bars"><div class="bars-grid">${hGrid(SCORE_TICKS)}</div>${bars}</div>`;
}

// ─── coverage grid ───────────────────────────────────────────────────────────

// Blue score-heat: low scores read pale, high scores deepen to vivid blue. The
// cell carries its own background and foreground so contrast holds on both
// themes, independent of the surface behind it.
export function coverageCellStyle(score) {
  const s = clamp(score);
  const light = 80 - (s / 100) * 40;
  const sat = 70 + (s / 100) * 22;
  return `background:hsl(214 ${sat}% ${light}%);color:${light > 58 ? '#0b1020' : '#fff'}`;
}

// Prompts as rows, models as columns. Cells carry data-p / data-m so one
// delegated click handler on the table replaces a listener per cell.
export function renderCoverageGrid(prompts, models) {
  const head = models.map((m) => {
    const name = esc(m.name);
    return `<th><i style="background:${providerColor(m.provider)}"></i><span title="${name}">${name}</span></th>`;
  }).join('');

  const rows = prompts.map((p) => {
    const cells = models.map((m) => {
      const run = p.runsMap[m.id];
      const label = esc(m.name) + (run ? ` · ${fmt1(run.score)}` : ' · not run yet');
      return run
        ? `<td><button class="matrix-cell" style="${coverageCellStyle(run.score)}" data-p="${p.id}" data-m="${m.id}" title="${label}">${Math.round(run.score)}</button></td>`
        : `<td><button class="matrix-cell chip" data-p="${p.id}" data-m="${m.id}" title="${label}" aria-label="Log run">+</button></td>`;
    }).join('');
    const text = esc(p.text);
    return `<tr><th class="matrix-head" scope="row"><span title="${text}">${text}</span></th>${cells}</tr>`;
  }).join('');

  return `<table class="matrix"><thead><tr><th class="matrix-head">Prompt</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ─── speed vs quality ────────────────────────────────────────────────────────

export function renderScatterChart(rows) {
  const plotRows = rows.filter((r) => r.avgTime != null && Number.isFinite(r.avgTime));
  if (!plotRows.length) return '';

  // Snap the time ceiling to a clean multiple so the gridlines land on round numbers.
  const maxTime = Math.max(...plotRows.map((r) => r.avgTime));
  let tCeil = 5;
  while (tCeil < maxTime * 1.15) tCeil += tCeil <= 20 ? 5 : 10;

  const tStep = tCeil <= 10 ? 2 : tCeil <= 30 ? 5 : 10;
  const v = [];
  for (let t = 0; t <= tCeil; t += tStep) v.push({ pct: (t / tCeil) * 100, label: `${t}s` });

  const points = plotRows.map((r) => ({
    x: clamp((r.avgTime / tCeil) * 100),
    y: clamp(r.adjusted),
    color: providerColor(r.model.provider),
    faint: r.lowConfidence,
    title: r.model.name + (r.lowConfidence ? ' · low n' : ''),
    sub: `${fmt1(r.adjusted)} adj · ${fmt1(r.avgTime)}s`,
    aria: `${r.model.name}: ${fmt1(r.adjusted)} adj, ${fmt1(r.avgTime)} seconds${r.lowConfidence ? ' (low n)' : ''}`,
  }));

  return plot({ yLabel: 'Adj. score', xLabel: 'Avg response time (s)', h: SCORE_TICKS, v, points });
}

// ─── intelligence vs cost ────────────────────────────────────────────────────

const COST_TICKS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100];

function fmtCost(c) {
  if (c === 0) return '$0.00';
  if (c < 0.1) return `$${c.toFixed(3)}`;
  if (c < 10) return `$${c.toFixed(2)}`;
  return `$${fmt1(c)}`;
}

export function renderIntelligenceCostChart(models) {
  const scored = models.filter((m) => m.intelligence != null);
  if (!scored.length) return empty('No models match your filters, or none have intelligence data.');

  // Blended cost: 3:1 input-to-output, matching the store's 'blended' basis.
  const withCost = scored.map((m) => {
    const inp = m.price1mInput ?? m.price1mOutput ?? 0;
    const out = m.price1mOutput ?? m.price1mInput ?? 0;
    return { ...m, cost: (3 * inp + out) / 4 };
  });

  // Log X axis over the cost decades actually present.
  const costs = withCost.map((m) => m.cost).filter((c) => c > 0);
  const minCost = costs.length ? Math.min(...costs) : 0.1;
  const maxCost = costs.length ? Math.max(...costs) : 10;
  const minTick = minCost >= 0.5 ? 0.1 : 0.01;
  const maxTick = maxCost <= 2 ? 5 : maxCost <= 8 ? 10 : maxCost <= 40 ? 50 : 100;
  const minLog = Math.log10(minTick);
  const logSpan = Math.log10(maxTick) - minLog || 1;
  const atCost = (c) => clamp(((Math.log10(Math.max(minTick, c)) - minLog) / logSpan) * 100);

  const y = scale(withCost.map((m) => m.intelligence));

  // Pareto frontier: cheapest-first sweep keeping each new intelligence high.
  // O(n log n) — the pairwise version pegged the CPU at 400+ models.
  const frontier = [];
  let bestIq = -Infinity;
  for (const m of [...withCost].sort((a, b) => a.cost - b.cost || b.intelligence - a.intelligence)) {
    if (m.intelligence > bestIq) {
      bestIq = m.intelligence;
      frontier.push(m);
    }
  }
  const onFrontier = new Set(frontier.map((m) => m.id));

  const points = withCost.map((m) => {
    const unpriced = m.price1mInput == null && m.price1mOutput == null;
    const price = unpriced ? 'Unpriced' : `${fmtCost(m.cost)}/1M`;
    const detail = !unpriced && m.price1mInput != null && m.price1mOutput != null
      ? ` · in $${m.price1mInput} / out $${m.price1mOutput}` : '';
    return {
      x: atCost(m.cost),
      y: y.at(m.intelligence),
      color: providerColor(m.provider),
      lead: onFrontier.has(m.id),
      title: `${m.name} (${m.provider})`,
      sub: `IQ ${m.intelligence} · ${price}${detail}`,
      aria: `${m.name} (${m.provider}): IQ ${m.intelligence}, ${price}`,
    };
  });

  return plot({
    yLabel: 'Intelligence Index',
    xLabel: 'Cost per 1M tokens ($, log scale)',
    h: y.ticks,
    v: COST_TICKS.filter((t) => t >= minTick && t <= maxTick).map((t) => ({ pct: atCost(t), label: `$${t}` })),
    points,
    overlay: trace(frontier.map((m) => ({ x: atCost(m.cost), y: y.at(m.intelligence) })), 'Efficiency frontier'),
  });
}

// ─── intelligence vs release date ────────────────────────────────────────────

// AA sends full dates, but tolerate bare "2025" / "2025-06" too.
function parseReleased(value) {
  const direct = Date.parse(value);
  if (!isNaN(direct)) return direct;
  const parts = String(value).split('-');
  const padded = parts.length === 1 ? `${parts[0]}-01-01` : parts.length === 2 ? `${parts[0]}-${parts[1]}-01` : null;
  const fallback = padded ? Date.parse(padded) : NaN;
  return isNaN(fallback) ? null : fallback;
}

export function renderIntelligenceTimelineChart(models) {
  const parsed = (models || [])
    .filter((m) => m && m.intelligence != null && m.releasedAt)
    .map((m) => ({ ...m, at: parseReleased(m.releasedAt) }))
    .filter((m) => m.at != null)
    .sort((a, b) => a.at - b.at);

  if (!parsed.length) return empty('No models match your filters, or none have release dates.');

  const span = (parsed[parsed.length - 1].at - parsed[0].at) || 30 * 24 * 3600 * 1000;
  const minTime = parsed[0].at - span * 0.05;
  const fullSpan = span * 1.1 || 1;
  const atTime = (t) => clamp(((t - minTime) / fullSpan) * 100);

  const y = scale(parsed.map((m) => m.intelligence));

  // Running best-so-far: the SOTA staircase.
  const peaks = [];
  let bestIq = -Infinity;
  for (const m of parsed) {
    if (m.intelligence > bestIq) {
      bestIq = m.intelligence;
      peaks.push(m);
    }
  }
  const isPeak = new Set(peaks.map((m) => m.id));

  const v = Array.from({ length: 5 }, (_, i) => ({
    pct: (i / 4) * 100,
    label: new Date(minTime + (fullSpan * i) / 4).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  }));

  const points = parsed.map((m) => ({
    x: atTime(m.at),
    y: y.at(m.intelligence),
    color: providerColor(m.provider),
    lead: isPeak.has(m.id),
    title: `${m.name} (${m.provider})`,
    sub: `IQ ${m.intelligence} · ${m.releasedAt}`,
    aria: `${m.name} (${m.provider}): IQ ${m.intelligence}, released ${m.releasedAt}`,
  }));

  return plot({
    yLabel: 'Intelligence Index',
    xLabel: 'Release date',
    h: y.ticks,
    v,
    points,
    overlay: trace(peaks.map((m) => ({ x: atTime(m.at), y: y.at(m.intelligence) })), 'SOTA progression'),
  });
}
