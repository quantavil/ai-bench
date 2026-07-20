// The Alpine component. Holds state, wires the pure helpers to the UI, and
// owns every mutation + persist cycle.

import { CATEGORIES, SORT_MODES, CHART_MODES, MODEL_VIEW_MODES, UNDO_WINDOW_MS, SHRINKAGE_C } from '../utils/config.js';
import { providerColor } from '../utils/providers.js';
import { loadData, saveData, syncModels as apiSyncModels, testAaKey as apiTestAaKey } from '../api/client.js';
import { aggregate, rank, categoriesInUse, totalRuns } from '../utils/ranking.js';
import { renderBarChart, renderScatterChart, renderIntelligenceCostChart } from '../charts/svgCharts.js';
import { uid, fmt1, fmtDate, fmtDateTime, fmtDateTimeCompact } from '../utils/formatters.js';

const AA_KEY_STORAGE = 'bench-aa-api-key';

function loadStoredAaKey() {
  try {
    return localStorage.getItem(AA_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function normalise(raw) {
  const prompts = (raw?.prompts || []).map((p) => ({
    ...p,
    runsMap: Object.fromEntries((p.runs || []).map((r) => [r.modelId, r]))
  }));
  const testedModelIds = new Set();
  prompts.forEach((p) => {
    p.runs.forEach((r) => {
      testedModelIds.add(r.modelId);
    });
  });
  return {
    version: raw?.version || 0,
    models: raw?.models || [],
    prompts,
    lastSyncedAt: raw?.lastSyncedAt || null,
    testedModelIds
  };
}

export function bench() {
  return {
    // constants exposed to the template
    CATEGORIES,
    SORT_MODES,
    CHART_MODES,
    MODEL_VIEW_MODES,

    // data + meta
    data: { version: 0, models: [], prompts: [], lastSyncedAt: null },
    loading: true,
    dark: document.documentElement.classList.contains('dark'),
    saving: false,
    syncing: false,
    // Artificial Analysis key lives only in this browser (localStorage), never in KV.
    aaApiKey: loadStoredAaKey(),
    aaKeyDraft: loadStoredAaKey(),
    testingAaKey: false,
    cachedRankedRows: [],
    cachedGlobalMean: null,
    cachedPromptAvgs: {},
    get globalMean() {
      return this.cachedGlobalMean;
    },

    // view state
    tab: 'leaderboard',           // leaderboard | prompts | models
    category: 'all',
    sortMode: 'adjusted',
    chartMode: 'bar',
    modelsViewMode: 'list',
    search: '',
    isKeyboardOpen: false,
    expandedPrompts: {},
    expandedQuestions: {},
    shownAnswers: {},
    showMatrix: false,
    // modals
    inlinePrompt: { open: false, id: null, text: '', category: CATEGORIES[0], error: '' },
    inlineRun: { open: false, mode: 'add', promptId: null, id: null, modelId: '', score: null, time: '', answer: '', error: '' },
    confirm: { open: false, title: '', body: '', cta: 'Delete', action: () => {} },
    toast: { show: false, kind: 'ok', msg: '', undo: null },
    toastTimer: null,

    // ---------------------------------------------------------------- boot
    async init() {
      // Hash-based routing
      const handleHash = () => {
        const hash = window.location.hash.slice(1);
        if (['leaderboard', 'prompts', 'models', 'settings'].includes(hash)) {
          this.tab = hash;
        }
      };
      window.addEventListener('hashchange', handleHash);
      handleHash();

      this.$watch('tab', (val) => {
        if (window.location.hash !== '#' + val) {
          window.location.hash = val;
        }
        window.scrollTo({ top: 0 });
        this.search = '';
      });



      // Watch modal states to lock body scroll on mobile and control native <dialog> elements
      const modalMap = {
        'confirm.open': 'confirm-dialog'
      };
      Object.entries(modalMap).forEach(([key, dialogId]) => {
        this.$watch(key, (val) => {
          this.toggleBodyScroll();
          const dialog = document.getElementById(dialogId);
          if (dialog) {
            if (val) {
              if (!dialog.open) dialog.showModal();
            } else {
              if (dialog.open) dialog.close();
            }
          }
        });
      });

      this.$watch('category', () => this.updateRankedRows());
      this.$watch('sortMode', () => this.updateRankedRows());

      // Keyboard detection
      const handleFocus = (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          this.isKeyboardOpen = true;
        }
      };
      const handleBlur = (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          this.isKeyboardOpen = false;
        }
      };
      window.addEventListener('focusin', handleFocus);
      window.addEventListener('focusout', handleBlur);

      await this.load();
    },

    async load() {
      this.loading = true;
      const res = await loadData();
      this.loading = false;
      if (res.ok) {
        this.applyData(res.body);
      } else {
        this.notify('error', 'Could not load data from the server. Check your connection.');
      }
    },

    applyData(raw) {
      this.data = normalise(raw);
      this.updateRankedRows();
    },

    // Pull the latest from the server (used after a version conflict).
    async refresh() {
      const res = await loadData();
      if (res.ok) { this.applyData(res.body); }
      return res.ok;
    },

    // ---------------------------------------------------------------- persist
    // Full-dataset write guarded by version. A 409 means another device wrote
    // since we loaded; we reload rather than clobber.
    async persist({ quiet = false } = {}) {
      this.saving = true;
      const cleanPrompts = this.data.prompts.map(({ runsMap, ...p }) => p);
      const payload = { version: this.data.version, models: this.data.models, prompts: cleanPrompts, lastSyncedAt: this.data.lastSyncedAt };
      const res = await saveData(payload);
      this.saving = false;

      if (res.ok) {
        this.data.version = res.body.version;
        if (!quiet) this.notify('ok', 'Saved.');
        return true;
      }
      if (res.status === 409) {
        this.notify('error', 'Another device changed the data. Reloading the latest.');
        await this.refresh();
        return false;
      }
      this.notify('error', res.body.error || 'Save failed. Your last change is not stored.');
      return false;
    },

    // Mutate, persist, roll back the local state if the server rejects.
    async mutate(fn, opts = {}) {
      const snapshot = JSON.parse(JSON.stringify(this.data));
      fn();
      this.data = normalise(this.data);
      const ok = await this.persist(opts);
      if (!ok && this.data.version === snapshot.version) {
        this.data = snapshot; // only roll back if we did not already reload
      }
      this.updateRankedRows();
      return ok;
    },

    // A delete that can be reversed within a short window. Snapshots the current
    // models/prompts, applies the removal, then offers Undo which restores the
    // snapshot against the current version.
    async deleteWithUndo(fn, label) {
      const before = {
        models: JSON.parse(JSON.stringify(this.data.models)),
        prompts: JSON.parse(JSON.stringify(this.data.prompts)),
      };
      const ok = await this.mutate(fn, { quiet: true });
      if (!ok) return;
      this.notify('ok', label + ' deleted.', {
        label: 'Undo',
        run: async () => {
          await this.mutate(() => {
            this.data.models = before.models;
            this.data.prompts = before.prompts;
          }, { quiet: true });
          this.notify('ok', 'Restored.');
        },
      });
    },

    // ---------------------------------------------------------------- derived
    providerColor(name) { return providerColor(name); },

    fmt1(n) { return fmt1(n); },

    rowStyle(row) {
      const color = this.providerColor(row.model.provider);
      if (row.rank === 1) {
        return `box-shadow: var(--shadow-glass), 0 0 0 1px color-mix(in srgb, ${color} 33%, transparent), 0 18px 40px -22px color-mix(in srgb, ${color} 67%, transparent)`;
      }
      if (row.rank === 2) {
        return `border-color: color-mix(in srgb, ${color} 35%, transparent); box-shadow: 0 6px 20px -12px color-mix(in srgb, ${color} 45%, transparent)`;
      }
      if (row.rank === 3) {
        return `border-color: color-mix(in srgb, ${color} 20%, transparent); box-shadow: 0 4px 12px -8px color-mix(in srgb, ${color} 30%, transparent)`;
      }
      return '';
    },

    fmtDate(ms) { return fmtDate(ms); },
    fmtDateTime(ms) { return fmtDateTime(ms); },
    fmtDateTimeCompact(ms) { return fmtDateTimeCompact(ms); },
    scrollDropdownActive(buttonEl) {
      this.$nextTick(() => {
        const el = buttonEl.nextElementSibling?.querySelector('[data-dropdown-active]');
        if (el) el.scrollIntoView({ block: 'nearest' });
      });
    },
    handleDropdownKey(e, state, items, selectFn) {
      if (e.key === 'Tab') {
        state.open = false;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.open) {
          state.open = true;
        } else if (items.length) {
          state.activeIdx = (state.activeIdx + 1) % items.length;
          this.scrollDropdownActive(e.target);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.open && items.length) {
          state.activeIdx = (state.activeIdx - 1 + items.length) % items.length;
          this.scrollDropdownActive(e.target);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.open) {
          selectFn(state.activeIdx);
          state.open = false;
        } else {
          state.open = true;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        state.open = false;
      }
    },

    modelName(id) {
      const m = this.data.models.find((x) => x.id === id);
      return m ? m.name : 'Unknown model';
    },
    modelProvider(id) {
      const m = this.data.models.find((x) => x.id === id);
      return m ? m.provider : '';
    },

    get totalRuns() { return totalRuns(this.data); },

    // Aggregated + ranked rows for the current category/sort.
    get rankedRows() { return this.cachedRankedRows; },

    // Aggregated rows for the models tab, sorted by intelligence score descending.
    get rankedModelsByIntelligence() {
      const q = this.search.trim().toLowerCase();
      const rows = aggregate(this.data, 'all');
      return rows
        .filter((r) => !q || r.model.name.toLowerCase().includes(q) || r.model.provider.toLowerCase().includes(q))
        .sort((a, b) => {
          const intelA = a.model.intelligence !== null ? a.model.intelligence : -1;
          const intelB = b.model.intelligence !== null ? b.model.intelligence : -1;
          return intelB - intelA;
        });
    },

    get modelsPlotHtml() {
      const topModels = this.rankedModelsByIntelligence.slice(0, 100).map((r) => r.model);
      return renderIntelligenceCostChart(topModels);
    },

    // Standings rows: scored rows only, for the leaderboard.
    get leaderboardRows() { return this.rankedRows.filter((r) => r.n > 0); },

    // Only scored rows, for the charts.
    get chartRows() { return this.rankedRows.filter((r) => r.n > 0); },

    // Filter chips: 'all' plus any category that has prompts.
    get activeCategories() {
      const used = categoriesInUse(this.data);
      return CATEGORIES.filter((c) => used.has(c));
    },

    get filteredPrompts() {
      const q = this.search.trim().toLowerCase();
      return this.data.prompts
        .filter((p) => this.category === 'all' || p.category === this.category)
        .filter((p) => !q || p.text.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    // Runs of a prompt, best score first.
    sortedRuns(prompt) {
      return prompt.runs.slice().sort((a, b) => b.score - a.score);
    },

    promptAvg(prompt) {
      return this.cachedPromptAvgs?.[prompt.id] ?? null;
    },

    // Models with no run yet on this prompt (for the add-run picker).
    availableModels(promptId) {
      const prompt = this.data.prompts.find((p) => p.id === promptId);
      if (!prompt) return [];
      const used = new Set(prompt.runs.map((r) => r.modelId));
      return this.data.models.filter((m) => !used.has(m.id));
    },
    suggestedModels(promptId) {
      const available = this.availableModels(promptId);
      if (available.length === 0) return [];

      const allTestedModelIds = this.data.testedModelIds || new Set();

      let candidates = available.filter((m) => allTestedModelIds.has(m.id));
      if (candidates.length === 0) return [];

      candidates.sort((a, b) => {
        const intelA = a.intelligence ?? -1;
        const intelB = b.intelligence ?? -1;
        return intelB - intelA || b.id.localeCompare(a.id);
      });

      return candidates.slice(0, 2);
    },

    togglePrompt(id) {
      this.expandedPrompts[id] = !this.expandedPrompts[id];
      if (!this.expandedPrompts[id]) {
        this.expandedQuestions[id] = false;
      }
    },
    togglePromptText(id) {
      if (!this.expandedPrompts[id]) {
        this.expandedPrompts[id] = true;
      } else {
        this.expandedQuestions[id] = !this.expandedQuestions[id];
      }
    },

    // ---------------------------------------------------------------- coverage matrix
    // The matrix shows filtered prompts as rows, models as columns; each cell is
    // the score if run, or a fast entry point if not. It makes gaps obvious.

    coverage(prompt) {
      const total = this.data.models.length;
      return { done: prompt.runs.length, total };
    },
    // Self-contained cell colour (own bg + fg) so contrast holds on both themes:
    // a teal ramp from light (low score) to dark (high score), text flipped by
    // lightness. Independent of the surrounding light/dark surface.
    matrixCellStyle(score) {
      // Blue score-heat: low scores read pale, high scores deepen to vivid blue.
      const s = Math.max(0, Math.min(100, score));
      const L = 80 - (s / 100) * 40; // 80% -> 40%
      const sat = 70 + (s / 100) * 22; // richer as it climbs
      const fg = L > 58 ? '#0b1020' : '#ffffff';
      return `background: hsl(214 ${sat}% ${L}%); color: ${fg}; border:1px solid rgba(255,255,255,.28)`;
    },

    // ---------------------------------------------------------------- charts
    get chartHtml() {
      const rows = this.chartRows;
      if (!rows.length) return '';
      return this.chartMode === 'scatter'
        ? renderScatterChart(rows)
        : renderBarChart(rows);
    },

    // ---------------------------------------------------------------- models / AA key
    saveAaApiKey() {
      const key = (this.aaKeyDraft || '').trim();
      this.aaApiKey = key;
      this.aaKeyDraft = key;
      try {
        if (key) localStorage.setItem(AA_KEY_STORAGE, key);
        else localStorage.removeItem(AA_KEY_STORAGE);
      } catch {
        this.notify('error', 'Could not save the key in this browser.');
        return;
      }
      this.notify('ok', key ? 'API key saved on this device.' : 'API key cleared.');
    },

    async testAaApiKey() {
      const key = (this.aaKeyDraft || this.aaApiKey || '').trim();
      if (!key) {
        this.notify('error', 'Enter an API key first.');
        return;
      }
      if (this.testingAaKey) return;
      this.testingAaKey = true;
      const res = await apiTestAaKey(key);
      this.testingAaKey = false;
      if (res.ok) this.notify('ok', 'API key works.');
      else this.notify('error', res.body?.error || 'Key test failed.');
    },

    async syncModels() {
      if (this.syncing) return;
      const apiKey = (this.aaApiKey || '').trim();
      if (!apiKey) {
        this.notify('error', 'Set your Artificial Analysis API key in Settings first.');
        this.tab = 'settings';
        return;
      }
      this.syncing = true;
      const res = await apiSyncModels(this.data.version, apiKey);
      this.syncing = false;
      if (res.ok) {
        this.applyData(res.body);
        this.notify('ok', 'Models synced successfully.');
      } else if (res.status === 409) {
        this.notify('error', 'Another device changed the data. Reloading the latest.');
        await this.refresh();
      } else {
        this.notify('error', res.body?.error || 'Sync failed.');
      }
    },

    // ---------------------------------------------------------------- prompts
    openAddPrompt() {
      this.inlinePrompt = { open: !this.inlinePrompt.open, id: null, text: '', category: CATEGORIES[0], error: '' };
      if (this.inlinePrompt.open) this.$nextTick(() => this.$refs.inlinePromptText?.focus());
    },
    openEditPrompt(p) {
      this.inlinePrompt = { open: true, id: p.id, text: p.text, category: p.category, error: '' };
      this.$nextTick(() => this.$refs.inlinePromptText?.focus());
    },
    async saveInlinePrompt() {
      const text = this.inlinePrompt.text.trim();
      if (!text) { this.inlinePrompt.error = 'The prompt text is required.'; return; }
      const category = this.inlinePrompt.category || 'Other';
      const ok = await this.mutate(() => {
        if (this.inlinePrompt.id) {
          const p = this.data.prompts.find((x) => x.id === this.inlinePrompt.id);
          if (p) { p.text = text; p.category = category; }
        } else {
          this.data.prompts.push({ id: uid(), text, category, createdAt: Date.now(), runs: [] });
        }
      });
      if (ok) this.inlinePrompt.open = false;
      else this.inlinePrompt.error = 'Save failed.';
    },
    confirmDeletePrompt(p) {
      this.confirm = {
        open: true,
        title: 'Delete this prompt?',
        body: 'Removes the prompt and its ' + p.runs.length + ' run(s).',
        cta: 'Delete prompt',
        action: () => this.deleteWithUndo(() => {
          this.data.prompts = this.data.prompts.filter((x) => x.id !== p.id);
          delete this.expandedPrompts[p.id];
          delete this.expandedQuestions[p.id];
          for (const r of p.runs) {
            delete this.shownAnswers[r.id];
          }
          if (this.inlineRun.promptId === p.id) {
             this.inlineRun.open = false;
          }
        }, 'Prompt'),
      };
    },

    // ---------------------------------------------------------------- runs
    openAddRun(promptId, presetModelId = null) {
      if (this.inlineRun.open && this.inlineRun.promptId === promptId && this.inlineRun.mode === 'add' && !presetModelId) {
        this.inlineRun.open = false;
        return;
      }
      const avail = this.availableModels(promptId);
      const modelId = presetModelId && avail.some((m) => m.id === presetModelId)
        ? presetModelId
        : (avail[0] ? avail[0].id : '');
      this.inlineRun = {
        open: true, mode: 'add', promptId, id: null,
        modelId, score: null, time: '', answer: '', error: '',
      };
      this.expandedPrompts[promptId] = true;
      this.$nextTick(() => {
        const el = document.getElementById(presetModelId ? `r-score-${promptId}` : `r-model-${promptId}`);
        if (el) el.focus();
      });
    },
    openEditRun(promptId, r) {
      if (this.inlineRun.open && this.inlineRun.id === r.id) {
        this.inlineRun.open = false;
        return;
      }
      this.inlineRun = {
        open: true, mode: 'edit', promptId, id: r.id,
        modelId: r.modelId, score: r.score, time: r.time.toString(),
        answer: r.answer, error: '',
      };
      this.expandedPrompts[promptId] = true;
      this.$nextTick(() => {
        const el = document.getElementById(`r-score-${promptId}`);
        if (el) el.focus();
      });
    },
    async saveInlineRun() {
      const modelId = this.inlineRun.modelId;
      const score = Number(this.inlineRun.score);
      const timeStr = this.inlineRun.time;

      if (!modelId) { this.inlineRun.error = 'Pick a model to log.'; return; }
      if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 100) {
        this.inlineRun.error = 'Score must be an integer between 0 and 100.'; return;
      }

      let parsedTime = 0;
      if (timeStr === undefined || timeStr === null || timeStr.toString().trim() === '') {
        parsedTime = 0;   // blank = unknown, excluded from time stats
      } else {
        const str = timeStr.toString().trim();
        if (/^\d+(\.\d+)?$/.test(str)) {
          parsedTime = Number(str);
        } else {
          let seconds = 0;
          const regex = /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/gi;
          let match;
          let found = false;
          while ((match = regex.exec(str)) !== null) {
            found = true;
            const val = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            if (unit.startsWith('m')) seconds += val * 60;
            else if (unit.startsWith('s')) seconds += val;
          }
          if (!found) {
            this.inlineRun.error = 'Time format not recognized. Use seconds (e.g. 120) or format like 1m 20s.';
            return;
          }
          parsedTime = seconds;
        }
      }

      if (!Number.isFinite(parsedTime) || parsedTime < 0) {
        this.inlineRun.error = 'Time must be zero or a positive amount.'; return;
      }
      
      const time = parsedTime;

      if (this.inlineRun.mode === 'add') {
        const p = this.data.prompts.find((x) => x.id === this.inlineRun.promptId);
        if (p && p.runsMap && p.runsMap[modelId]) {
          this.inlineRun.error = 'This model already has a run for this prompt.';
          return;
        }
      }

      const ok = await this.mutate(() => {
        const p = this.data.prompts.find((x) => x.id === this.inlineRun.promptId);
        if (!p) return;
        if (this.inlineRun.mode === 'add') {
          p.runs.push({
            id: uid(), modelId, score, time,
            answer: this.inlineRun.answer || '',
            createdAt: Date.now(),
          });
        } else {
          const r = p.runs.find((x) => x.id === this.inlineRun.id);
          if (r) { r.score = score; r.time = time; r.answer = this.inlineRun.answer || ''; }
        }
      });
      if (ok) this.inlineRun.open = false;
      else this.inlineRun.error = 'Save failed. Nothing was stored.';
    },
    confirmDeleteRun(promptId, r) {
      this.confirm = {
        open: true,
        title: 'Delete this run?',
        body: 'Removes ' + this.modelName(r.modelId) + "'s result for this prompt.",
        cta: 'Delete run',
        action: () => this.deleteWithUndo(() => {
          const p = this.data.prompts.find((x) => x.id === promptId);
          if (p) p.runs = p.runs.filter((x) => x.id !== r.id);
          delete this.shownAnswers[r.id];
        }, 'Run'),
      };
    },


    // ---------------------------------------------------------------- import / export
    exportJson() {
      const stamp = new Date().toISOString().slice(0, 10);
      const cleanPrompts = this.data.prompts.map(({ runsMap, ...p }) => p);
      const cleanData = { ...this.data, prompts: cleanPrompts };
      const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bench-export-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    handleImport(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); }
        catch { this.notify('error', 'That file is not valid JSON.'); return; }
        if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.models) && !Array.isArray(parsed.prompts))) {
          this.notify('error', 'That file does not look like a bench export.'); return;
        }
        const incoming = normalise(parsed);
        this.confirm = {
          open: true,
          title: 'Replace everything?',
          body: 'Wipes the current dataset (' + this.data.models.length + ' models, ' +
                this.data.prompts.length + ' prompts) and replaces it with ' +
                incoming.models.length + ' models and ' + incoming.prompts.length +
                ' prompts. No merge.',
          cta: 'Replace dataset',
          action: async () => {
            const previous = this.data;
            // Adopt the current server version, and if the server moved under us
            // (409), reload and retry once against the fresh version so the
            // import is not silently dropped.
            this.data = { ...incoming, version: this.data.version };
            let ok = await this.persist({ quiet: true });
            if (!ok && this.data.version !== previous.version) {
              this.data = { ...incoming, version: this.data.version };
              ok = await this.persist({ quiet: true });
            }
            if (!ok) { this.data = previous; this.notify('error', 'Import failed. Nothing was replaced.'); }
            else {
              this.category = 'all';
              this.expandedPrompts = {};
              this.shownAnswers = {};
              this.search = '';
              this.showMatrix = false;
              this.notify('ok', 'Dataset replaced.');
            }
            this.updateRankedRows();
          },
        };
      };
      reader.onerror = () => this.notify('error', 'Could not read that file.');
      reader.readAsText(file);
    },

    // ---------------------------------------------------------------- misc
    cycleSortMode() {
      const idx = SORT_MODES.findIndex(m => m.id === this.sortMode);
      const nextIdx = (idx + 1) % SORT_MODES.length;
      this.sortMode = SORT_MODES[nextIdx].id;
    },

    updateRankedRows() {
      const aggregated = aggregate(this.data, this.category);
      this.cachedRankedRows = rank(aggregated, this.sortMode);
      const globalMean = aggregated.globalMean;
      this.cachedGlobalMean = globalMean;

      const promptAvgs = {};
      for (const p of this.data.prompts) {
        if (!p.runs.length) {
          promptAvgs[p.id] = null;
        } else {
          const n = p.runs.length;
          const sum = p.runs.reduce((s, r) => s + r.score, 0);
          promptAvgs[p.id] = (SHRINKAGE_C * globalMean + n * (sum / n)) / (SHRINKAGE_C + n);
        }
      }
      this.cachedPromptAvgs = promptAvgs;
    },

    notify(kind, msg, undo = null) {
      clearTimeout(this.toastTimer);
      this.toast = { show: true, kind, msg, undo };
      this.toastTimer = setTimeout(() => { this.toast.show = false; }, undo ? UNDO_WINDOW_MS : 2600);
    },
    runUndo() {
      const fn = this.toast.undo && this.toast.undo.run;
      this.toast.show = false;
      clearTimeout(this.toastTimer);
      if (fn) fn();
    },

    async copyToClipboard(text, label = 'Text') {
      try {
        await navigator.clipboard.writeText(text);
        this.notify('ok', label + ' copied.');
      } catch (err) {
        this.notify('error', 'Failed to copy ' + label.toLowerCase() + '.');
      }
    },

    toggleTheme() {
      this.dark = !this.dark;
      document.documentElement.classList.toggle('dark', this.dark);
      localStorage.setItem('bench-theme', this.dark ? 'dark' : 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', this.dark ? '#060814' : '#e9edf7');
    },

    toggleBodyScroll() {
      const open = this.confirm.open;
      document.body.classList.toggle('overflow-hidden', open);
    },
  };
}
