// Native HTML/CSS chart renderers. No Chart.js dependency. Each function takes
// ranked rows and returns an HTML string that Alpine injects via x-html.
// Styling uses CSS custom properties so both themes work without JS toggling.

import { providerColor } from '../utils/providers.js';
import { fmt1 } from '../utils/formatters.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withAlpha(color, alpha) {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function renderHorizontalGridlines(values, offsetClass) {
  return values.map((v) => `
    <div class="absolute left-0 right-0 border-t pointer-events-none" style="bottom:${v}%; border-color:var(--hair)">
      <span class="absolute ${offsetClass} -top-2 text-[9px] sm:text-[10px] font-mono tabular" style="color:var(--soft)">${v}</span>
    </div>
  `).join('');
}

// ─── vertical bar chart ──────────────────────────────────────────────────────

export function renderBarChart(rows) {
  if (!rows.length) return '';

  const bars = rows.map((r) => {
    const pct = Math.max(0, Math.min(100, r.adjusted));
    const color = providerColor(r.model.provider);
    const timeStr = r.avgTime != null ? ` · ${fmt1(r.avgTime)}s avg` : '';
    const isLowN = r.lowConfidence;
    const tooltip = `${fmt1(r.adjusted)} adj · ${r.n} run${r.n === 1 ? '' : 's'}${timeStr}${isLowN ? ' (low n)' : ''}`;

    const borderStyle = isLowN ? `border: 2px dashed ${color}` : `border: 1px solid ${color}`;
    const bgStyle = isLowN ? `background: ${withAlpha(color, 0.45)}` : `background: ${withAlpha(color, 0.85)}`;
    const shadowStyle = isLowN ? '' : `; box-shadow: 0 4px 12px -4px ${withAlpha(color, 0.5)}`;

    return `
      <div class="relative flex flex-col items-center justify-end h-full flex-1 min-w-[38px] sm:min-w-[48px] group" title="${esc(tooltip)}">
        <!-- Top Label (Value) -->
        <span class="absolute left-0 right-0 text-center text-[10px] font-mono font-bold tabular t-strong pointer-events-none"
              style="bottom: calc(${pct}% + 6px);">
          ${fmt1(r.adjusted)}
        </span>
        
        <!-- Bar (Height scales exactly to 100% of the active container height) -->
        <div class="w-full max-w-[2rem] sm:max-w-[2.5rem] rounded-md transition-all duration-500 ease-out hover:brightness-110 hover:scale-105 cursor-default"
             style="height:${pct}%; ${bgStyle}; ${borderStyle}; min-height:4px${shadowStyle}">
        </div>
        
        <!-- Bottom Label (Model Name - slanted to the right with ellipsis to prevent overlap and truncation) -->
        <span class="absolute left-1/2 text-left text-[9px] sm:text-[10px] whitespace-nowrap overflow-hidden text-ellipsis cursor-default t-soft origin-top-left max-w-[70px] sm:max-w-[90px] block"
              style="top: calc(100% + 6px); transform: rotate(45deg);"
              title="${esc(r.model.name)}">
          ${esc(r.model.name)}
        </span>
      </div>`;
  }).join('');

  // Horizontal grid lines behind bars
  const gridLines = renderHorizontalGridlines([0, 25, 50, 75, 100], '-left-7');

  return `
    <div class="relative flex items-end justify-between gap-2 sm:gap-3 w-full min-w-max" 
         style="height: 360px; padding-top: 16px; padding-bottom: 84px; padding-left: 28px; padding-right: 48px;">
      <div class="absolute" style="top: 16px; bottom: 84px; left: 28px; right: 48px;">
        ${gridLines}
      </div>
      ${bars}
    </div>
  `;
}

// ─── scatter chart ───────────────────────────────────────────────────────────

export function renderScatterChart(rows) {
  const plotRows = rows.filter((r) => r.avgTime != null);
  if (!plotRows.length) return '';

  // Compute axis bounds. Score is always 0-100. Time auto-scales cleanly.
  const times = plotRows.map((r) => r.avgTime).filter((t) => t != null && Number.isFinite(t));
  const maxTime = times.length ? Math.max(...times) : 10;
  
  // Snap tCeil to a clean multiple of 5 or 10 to avoid ugly gridlines
  let tCeil = 5;
  while (tCeil < maxTime * 1.15) {
    tCeil += tCeil <= 20 ? 5 : 10;
  }
  tCeil = Math.max(5, tCeil);

  // Determine step size based on ceiling
  const tStep = tCeil <= 10 ? 2 : tCeil <= 30 ? 5 : 10;

  const seenCoords = {};
  const dots = plotRows.map((r) => {
    let x = Math.min((r.avgTime / tCeil) * 100, 100);
    let y = Math.max(0, Math.min(100, r.adjusted));
    
    // Deter collision overlap using golden-angle spiral offsets
    const coordKey = `${x.toFixed(1)}-${y.toFixed(1)}`;
    if (seenCoords[coordKey]) {
      const count = seenCoords[coordKey];
      seenCoords[coordKey] = count + 1;
      const angle = count * 2.39996; // Golden angle in radians
      const dist = 0.8 * Math.sqrt(count); // small visual offset distance in percentage
      x += Math.cos(angle) * dist;
      y += Math.sin(angle) * dist;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
    } else {
      seenCoords[coordKey] = 1;
    }

    const color = providerColor(r.model.provider);
    const isLowN = r.lowConfidence;
    const ariaLabel = `${esc(r.model.name)}: ${fmt1(r.adjusted)} adj, ${fmt1(r.avgTime)} seconds${isLowN ? ' (low n)' : ''}`;

    const borderStyle = isLowN ? `border: 2px dashed ${color}` : `border: 2px solid var(--glass-brd)`;
    const bgStyle = isLowN ? `background: ${withAlpha(color, 0.45)}` : `background: ${withAlpha(color, 0.95)}`;
    const shadowStyle = isLowN ? '' : `; box-shadow: 0 0 8px ${withAlpha(color, 0.6)}`;

    const isTop = y > 75;
    const tooltipVClass = isTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5';
    const isLeft = x < 15;
    const isRight = x > 85;
    const tooltipHClass = isLeft ? 'left-0 translate-x-0' : (isRight ? 'right-0 left-auto translate-x-0' : 'left-1/2 -translate-x-1/2');

    return `
      <div class="absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 translate-y-1/2 transition-transform duration-200 hover:scale-150 focus:scale-150 cursor-default z-10 hover:z-50 focus:z-50 group focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
           tabindex="0"
           style="left:${x}%; bottom:${y}%; ${bgStyle}; ${borderStyle}${shadowStyle}"
           role="img" aria-label="${ariaLabel}">
        <div class="hidden group-hover:block group-focus:block absolute ${tooltipVClass} ${tooltipHClass} px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap z-50 pointer-events-none shadow-xl"
             style="background:var(--glass-bg-hi);border:1px solid var(--glass-brd);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--strong)">
          <span class="font-bold font-sans block text-[10px] leading-tight">${esc(r.model.name)}${isLowN ? ' <span class="text-[8px] px-1 rounded font-mono uppercase bg-danger/20 text-danger inline-block ml-0.5">low n</span>' : ''}</span>
          <span class="text-[9px] t-soft block leading-tight mt-0.5">${fmt1(r.adjusted)} adj · ${fmt1(r.avgTime)}s</span>
        </div>
      </div>`;
  }).join('');

  // Grid lines (horizontal at 0, 25, 50, 75, 100)
  const hLines = renderHorizontalGridlines([0, 25, 50, 75, 100], '-left-6');

  // Vertical grid lines (time axis)
  const vLines = [];
  let idx = 0;
  for (let t = 0; t <= tCeil; t += tStep) {
    const pct = (t / tCeil) * 100;
    const isOdd = idx % 2 !== 0;
    const mobileClass = isOdd ? 'hidden sm:block' : '';
    vLines.push(`
      <div class="absolute top-0 bottom-0 border-l pointer-events-none ${mobileClass}" style="left:${pct}%;border-color:var(--hair)">
        <span class="absolute -bottom-5 left-0 -translate-x-1/2 text-[10px] font-mono tabular" style="color:var(--soft)">${t}s</span>
      </div>`);
    idx++;
  }

  return `
    <div class="w-full flex flex-col justify-between" style="height: 360px;">
      <div class="relative flex items-stretch pl-12 pr-2 pt-3 grow">
        <span class="absolute left-1.5 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-mono tracking-wide whitespace-nowrap" style="color:var(--soft)">Adj. score</span>
        <div class="grow relative" style="height: 280px;">
          ${hLines}
          ${vLines.join('')}
          ${dots}
        </div>
      </div>
      <div class="pl-12 pr-2 text-center pb-2">
        <span class="text-[10px] font-mono tracking-wide" style="color:var(--soft)">Avg response time (s)</span>
      </div>
    </div>
  `;
}

// ─── intelligence vs cost chart ──────────────────────────────────────────────

export function renderIntelligenceCostChart(models) {
  // Filter to models with intelligence index score
  const plotModels = models.filter((m) => m.intelligence != null);
  if (!plotModels.length) {
    return '<p class="text-sm t-soft text-center py-8">No models match your search query or have intelligence index data.</p>';
  }

  // Blended cost: 3:1 input-to-output ratio (fallback to available price or 0)
  const withCost = plotModels.map((m) => {
    const inp = m.price1mInput ?? m.price1mOutput ?? 0;
    const out = m.price1mOutput ?? m.price1mInput ?? 0;
    const blended = (3 * inp + out) / 4;
    return { ...m, blendedCost: blended };
  });

  // Helper for cost formatting
  const fmtCost = (c) => {
    if (c === 0) return '$0.00';
    if (c < 0.1) return `$${c.toFixed(3)}`;
    if (c < 10) return `$${c.toFixed(2)}`;
    return `$${fmt1(c)}`;
  };

  // --- X axis (cost) Logarithmic Auto-Scale ---
  const nonZeroCosts = withCost.map((m) => m.blendedCost).filter((c) => c > 0);
  const minCost = nonZeroCosts.length ? Math.min(...nonZeroCosts) : 0.1;
  const maxCost = nonZeroCosts.length ? Math.max(...nonZeroCosts) : 10;

  const candidateTicks = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100];

  let minTick = 0.01;
  if (minCost >= 0.5) minTick = 0.1;
  else if (minCost >= 0.05) minTick = 0.01;

  let maxTick = 100;
  if (maxCost <= 2) maxTick = 5;
  else if (maxCost <= 8) maxTick = 10;
  else if (maxCost <= 40) maxTick = 50;
  else maxTick = 100;

  const minLog = Math.log10(minTick);
  const maxLog = Math.log10(maxTick);
  const logSpan = maxLog - minLog || 1;

  const getLogX = (cost) => {
    const safeCost = Math.max(minTick, cost);
    const val = (Math.log10(safeCost) - minLog) / logSpan;
    return Math.max(0, Math.min(100, val * 100));
  };

  // --- Y axis (intelligence) auto-scale with padding ---
  const intels = withCost.map((m) => m.intelligence);
  const rawMin = Math.min(...intels);
  const rawMax = Math.max(...intels);
  const span = rawMax - rawMin || 10;
  const pad = span * 0.12;
  let yMin = Math.floor((rawMin - pad) / 5) * 5;
  let yMax = Math.ceil((rawMax + pad) / 5) * 5;
  if (yMin === yMax) { yMin -= 5; yMax += 5; }
  yMin = Math.max(0, yMin);
  yMax = Math.min(100, yMax);
  const yRange = yMax - yMin;
  const yStep = yRange <= 20 ? 5 : yRange <= 50 ? 10 : 20;

  // --- Pareto frontier (non-dominated set: no other model has both lower/equal cost AND higher/equal intelligence) ---
  const paretoFrontier = withCost.filter((m) => {
    return !withCost.some((other) =>
      other !== m &&
      other.blendedCost <= m.blendedCost &&
      other.intelligence >= m.intelligence &&
      (other.blendedCost < m.blendedCost || other.intelligence > m.intelligence)
    );
  }).sort((a, b) => a.blendedCost - b.blendedCost);

  // Frontier SVG polyline points (in % coordinates)
  const frontierPath = paretoFrontier.map((m) => {
    const x = getLogX(m.blendedCost);
    const y = Math.max(0, Math.min(100, ((m.intelligence - yMin) / yRange) * 100));
    return `${x},${100 - y}`;
  });

  // --- Horizontal grid lines (intelligence axis) ---
  const hGridValues = [];
  for (let v = yMin; v <= yMax; v += yStep) {
    hGridValues.push(v);
  }
  const hLines = hGridValues.map((v) => {
    const pct = ((v - yMin) / yRange) * 100;
    return `
      <div class="absolute left-0 right-0 border-t pointer-events-none" style="bottom:${pct}%; border-color:var(--hair)">
        <span class="absolute -left-6 -top-2 text-[9px] sm:text-[10px] font-mono tabular" style="color:var(--soft)">${v}</span>
      </div>`;
  }).join('');

  // --- Vertical grid lines (cost axis - log scale) ---
  const vTicks = candidateTicks.filter((t) => t >= minTick && t <= maxTick);
  const vLines = vTicks.map((t, idx) => {
    const pct = getLogX(t);
    const isOdd = idx % 2 !== 0;
    const mobileClass = isOdd ? 'hidden sm:block' : '';
    const label = t >= 1 ? `$${t}` : `$${t}`;
    return `
      <div class="absolute top-0 bottom-0 border-l pointer-events-none ${mobileClass}" style="left:${pct}%;border-color:var(--hair)">
        <span class="absolute -bottom-5 left-0 -translate-x-1/2 text-[10px] font-mono tabular" style="color:var(--soft)">${label}</span>
      </div>`;
  }).join('');

  // --- Dots ---
  const seenCoords = {};
  const dots = withCost.map((m) => {
    let x = getLogX(m.blendedCost);
    let y = Math.max(0, Math.min(100, ((m.intelligence - yMin) / yRange) * 100));

    // Collision avoidance
    const coordKey = `${x.toFixed(1)}-${y.toFixed(1)}`;
    if (seenCoords[coordKey]) {
      const count = seenCoords[coordKey];
      seenCoords[coordKey] = count + 1;
      const angle = count * 2.39996;
      const dist = 0.8 * Math.sqrt(count);
      x += Math.cos(angle) * dist;
      y += Math.sin(angle) * dist;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
    } else {
      seenCoords[coordKey] = 1;
    }

    const color = providerColor(m.provider);
    const isOnFrontier = paretoFrontier.some((f) => f.id === m.id);
    const isUnpriced = m.price1mInput == null && m.price1mOutput == null;
    const priceLabel = isUnpriced ? 'Unpriced' : `${fmtCost(m.blendedCost)}/1M`;

    const ariaLabel = `${esc(m.name)} (${esc(m.provider)}): IQ ${m.intelligence}, ${priceLabel}`;

    const bgStyle = `background: ${withAlpha(color, 0.95)}`;
    const borderStyle = isOnFrontier
      ? `border: 2px solid var(--color-accent)`
      : `border: 2px solid var(--glass-brd)`;
    const shadowStyle = `; box-shadow: 0 0 8px ${withAlpha(color, 0.6)}`;
    const sizeClass = isOnFrontier ? 'w-4 h-4' : 'w-3.5 h-3.5';

    const isTop = y > 75;
    const tooltipVClass = isTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5';
    const isLeft = x < 15;
    const isRight = x > 85;
    const tooltipHClass = isLeft ? 'left-0 translate-x-0' : (isRight ? 'right-0 left-auto translate-x-0' : 'left-1/2 -translate-x-1/2');

    const pricesDetail = (!isUnpriced && m.price1mInput != null && m.price1mOutput != null)
      ? ` · In: $${m.price1mInput} Out: $${m.price1mOutput}`
      : '';

    return `
      <div class="absolute ${sizeClass} rounded-full -translate-x-1/2 translate-y-1/2 transition-transform duration-200 hover:scale-150 focus:scale-150 cursor-default z-10 hover:z-50 focus:z-50 group focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
           tabindex="0"
           style="left:${x}%; bottom:${y}%; ${bgStyle}; ${borderStyle}${shadowStyle}"
           role="img" aria-label="${ariaLabel}">
        <div class="hidden group-hover:block group-focus:block absolute ${tooltipVClass} ${tooltipHClass} px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap z-50 pointer-events-none shadow-xl"
             style="background:var(--glass-bg-hi);border:1px solid var(--glass-brd);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--strong)">
          <span class="font-bold font-sans block text-[10px] leading-tight">${esc(m.name)} <span class="font-normal text-[9px] t-soft">(${esc(m.provider)})</span></span>
          <span class="text-[9px] t-soft block leading-tight mt-0.5">IQ: ${m.intelligence} · ${priceLabel}${pricesDetail}</span>
        </div>
      </div>`;
  }).join('');

  // --- Frontier line (SVG overlay) ---
  const frontierSvg = frontierPath.length >= 2 ? `
    <svg class="absolute inset-0 w-full h-full pointer-events-none z-[5]" preserveAspectRatio="none" viewBox="0 0 100 100">
      <polyline points="${frontierPath.join(' ')}" fill="none"
        stroke="var(--color-accent)" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round"
        stroke-dasharray="1.2 0.8" opacity="0.7" />
    </svg>
    <span class="absolute top-1 right-1 text-[9px] font-mono px-1.5 py-0.5 rounded z-20" style="color:var(--color-accent); background:var(--chip-bg); border:1px solid var(--glass-brd-soft)">Efficiency frontier</span>
  ` : '';

  return `
    <div class="w-full flex flex-col justify-between" style="height: 360px;">
      <div class="relative flex items-stretch pl-12 pr-2 pt-3 grow">
        <span class="absolute left-1.5 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-mono tracking-wide whitespace-nowrap" style="color:var(--soft)">Intelligence Index</span>
        <div class="grow relative" style="height: 280px;">
          ${hLines}
          ${vLines}
          ${frontierSvg}
          ${dots}
        </div>
      </div>
      <div class="pl-12 pr-2 text-center pb-2">
        <span class="text-[10px] font-mono tracking-wide" style="color:var(--soft)">Cost per 1M tokens ($, log scale)</span>
      </div>
    </div>
  `;
}