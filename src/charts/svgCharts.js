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
    const tooltipClass = isTop ? 'top-full mt-2' : 'bottom-full mb-2';

    return `
      <div class="absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 translate-y-1/2 transition-transform duration-200 hover:scale-150 focus:scale-150 cursor-default z-10 group focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
           tabindex="0"
           style="left:${x}%; bottom:${y}%; ${bgStyle}; ${borderStyle}${shadowStyle}"
           role="img" aria-label="${ariaLabel}">
        <div class="hidden group-hover:block group-focus:block absolute ${tooltipClass} left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap z-30 pointer-events-none shadow-xl"
             style="background:var(--glass-bg-hi);border:1px solid var(--glass-brd);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--strong)">
          <span class="font-semibold font-sans block mb-0.5">${esc(r.model.name)}${isLowN ? ' <span class="text-[9px] px-1 py-0.2 rounded font-mono uppercase bg-danger/20 text-danger inline-block ml-1">low n</span>' : ''}</span>
          ${fmt1(r.adjusted)} adj · ${fmt1(r.avgTime)}s
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