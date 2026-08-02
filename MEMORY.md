# Project: AI Bench

## Overview
Leaderboard dashboard for benchmarking AI models. Built with Astro, Tailwind CSS v4, and Alpine.js. Runs on Cloudflare Pages (Pages Functions + KV).

## Structure
- `src/pages/index.astro` - Astro UI layout entrypoint (imports components & styles).
- `src/components/` - Modular sub-components (Header, Sidebar, SettingsDialog, Tabs, Dialogs, etc. Note: DesktopNav.astro was deleted).
- `src/styles/index.css` - Unified Tailwind CSS v4 and custom glassmorphism styles.
- `src/store/appStore.js` - Alpine global store state & actions.
- `src/api/client.js` - Client network fetch wrapper.
- `src/charts/svgCharts.js` - SVG/DOM chart renderers.
- `src/utils/config.js` - Configuration constants.
- `src/utils/ranking.js` - Leaderboard math & aggregations.
- `src/utils/providers.js` - Brand color lookup helpers.
- `src/utils/formatters.js` - Clean string & UID formatting utilities.
- `functions/api/data.js` - Cloudflare Pages KV API (GET/POST) with strict validation.
- `functions/api/sync.js` - POST sync models from Artificial Analysis; requires `apiKey` in body (user-supplied).
- `functions/api/test-aa.js` - POST probe AA API key (Settings "Test key"); does not touch KV.
- `functions/api/_shared.js` - Shared helpers, Zod dataset validation, `readJsonBody`, AA helpers.
- `tests/` - `bun test` unit tests for ranking + validateDataset.

## Architecture & Setup
- wrangler: `bunx wrangler pages dev dist --kv BENCH_KV` (local dev simulation of built assets).
- Dev server: `bun run dev` (starts the local Astro development server).
- Build command: `bun run build` (compiles and bundles all assets into the `/dist` directory).
- Tests: `bun test` (or `bun run test`).
- Database CLI Access: Read KV dataset using `bunx wrangler kv key get --namespace-id <your-namespace-id> "dataset"`. Write/update dataset using `bunx wrangler kv key put --namespace-id <your-namespace-id> "dataset" --value '<json-payload>'`.
- AA API key: set in Settings UI; stored only in browser `localStorage` key `bench-aa-api-key`. Sent to `/api/sync` and `/api/test-aa`. Never hardcode; never store in KV. Rotate any previously exposed keys.
- Concurrency: Optimistic locking via `version` field. Because Cloudflare KV is eventually consistent and lacks atomic CAS, this reduces but does not eliminate clobbering (TOCTOU).
- Sync fail-closed: if `readStored` throws (corrupt/unreadable KV), `/api/sync` returns 500 and does not write.
- Routing: Hash-based `hashchange` listeners in `appStore.js`.
- Modals: Native HTML5 `<dialog>` elements synced with Alpine.js state. Transitions are styled using standard CSS `@starting-style`.
- Theming: Centralized under `:root` using the CSS `light-dark()` color scheme function. The `<meta name="theme-color">` is dynamically updated by `toggleTheme()`.

## UI/UX Rules & Insights
- Safe Areas: Respect mobile safe areas with `viewport-fit=cover` and `env(safe-area-inset-bottom)`.
- Scroll Position: Watcher resets window scroll (`window.scrollTo({ top: 0 })`) upon changing tabs.
- Scroll Padding: WebKit clips padding-right on flex scroll. Keep padding on the inner container (`px-4`) and remove `w-full` from scroll view so negative margins expand it.
- Inline Run Logging: Logging or editing model runs is handled inline inside the expanded container of each prompt card (using a single global `inlineRun` store state) instead of a modal dialog. Matrix clicks automatically expand the card and focus the inline form.
- Custom Dropdown UX: When utilizing custom selects with search, provide arrow/Enter/Escape navigation, roving focus highlight, and auto scroll-into-view.
- Autofocus Mobile Safeguard: Gate search input autofocus behind touch device check `!matchMedia('(pointer: coarse)').matches` to prevent virtual keyboard popup on mobile.

## Key Blunders (Do Not Repeat)
- ES Module Imports: Always group all `import` declarations at the very top of JS files. Placing functions or variables above imports causes browser SyntaxErrors.
- CSS light-dark() Toggling: If `color-scheme: light dark` is on `:root`, browser evaluates `light-dark()` based on system preference regardless of `.dark` class status. Set `:root` to `color-scheme: light` and `.dark` to `color-scheme: dark` to allow class toggling.
- Reactivity vs cost: Alpine re-evaluates a getter for *every* binding that reads it, so a getter that walks all models runs many times per interaction. Anything derived from the full model list (`cachedRankedRows`, `cachedModelRows`, `cachedModelsChart`) is stored in state and recomputed from an explicit `$watch`. The filter inputs are watched as one joined `modelFilterKey` string, so adding a filter only means listing it there. Plain getters are still fine for cheap, small derivations.
- Eager rendering is the main perf trap here, not compute: with ~400 synced models the app built ~60k DOM nodes up front (every prompt card's model dropdown listing all models, plus the hidden coverage grid). `x-show` still builds the DOM — use `x-if` for anything large that is usually closed.
- Dense views (charts, coverage grid) are rendered as HTML strings via `x-html` with one delegated click handler, not per-element Alpine bindings. Binding ~4.6k grid cells individually cost ~1.6s to open; the string version is ~100ms. Escape every interpolated value in the renderer (`esc()`).
- Tailwind Safelist: When using dynamic classes from JS like `overflow-hidden` for scroll-lock, ensure they appear in HTML markup or safelist comments so Tailwind JIT scanner compiles them.
- Content Visibility & Height Animation Lag: Avoid using `content-visibility: auto` or CSS grid height transitions on dynamic elements. They force continuous browser page height recalculations (reflows) on tab switching or card expansions, leading to stuttering/lag.
- `backdrop-filter` is per-element GPU work: each one is a composited layer that resamples what is behind it. Keep it on the few large surfaces (`.glass` cards, header, nav) and off repeated rows, chips, buttons and fields, or scrolling stutters. The aurora carries no `filter: blur()` for the same reason — its radial gradients are already soft, and blurring a viewport-sized layer that every `backdrop-filter` then samples is pure cost.
- Never size fixed overlays with `100vw`/`100vh` — that overflows by the scrollbar width and adds a horizontal scrollbar. Use `inset: 0`.
- A stray NUL byte in a source file makes `grep`/`file` treat it as binary and silently return nothing. If greps come back empty on a file you know matches, check `file <path>`.
- Bun Tarball Extraction Failure: If installing large libraries like Astro fails with "Fail extracting tarball", run `bun pm cache clean` to resolve corrupted dependencies in cache.
- Sync and Persist Version Conflict: Always run the KV dataset through the shared validator and include client versions in sync payloads to prevent TOCTOU race conditions and silent clobbers.
- Custom Popovers and Anchor Position: Avoid using experimental CSS anchor positioning for dropdown lists; prefer styling a native `<select>` element to ensure cross-browser compatibility and native mobile picker sheets.
- Zero-Time Statistics Penalties: Do not use hidden/implicit default values like `maxTimeLimit` for missing times; store blank times as `0` and exclude them from speed stats (i.e. model `avgTime`) to avoid penalizing models with unknown speed.
- Zod v4 errors: use `result.error.issues`, not `.errors` (v3 only). Wrong property throws on validation failure and turns 400s into 500s.
- Never hardcode AA API keys in source. User supplies key in Settings; server must require `apiKey` on sync with no fallback.
- Sync must not substitute an empty dataset when KV read fails — that wipes prompts/runs.

## Structural Changes
- Deleted `src/store/searchableSelect.js` (replaced inline selects with unified modal dialog picker).
- Reverted all native selector dropdown logic and removed `handleModelPickerClick` (all platforms use the custom search selector modal).
- Fixed early return bug in `src/utils/ranking.js`'s `aggregate` function, which left the calculated `globalMean` value unreachable and caused `promptAvg` to return `NaN`.
- Replaced the manual dataset validator in `functions/api/_shared.js` with a robust schema validation using `zod`.
- Optimized compact date formatting (`fmtDateTimeCompact`) in `appStore.js` using `Intl.DateTimeFormat`.
- Precomputed `runsMap` on prompts in `normalise()` rather than dynamically mapping in the `filteredPrompts` getter to eliminate garbage collection memory churn.
- Optimized rendering performance by reducing `.glass` blur from 22px to 14px and disabling background `.aurora` animation on mobile/reduced-motion devices.
- Replaced the global selector modal logic entirely with lightweight, keyboard-navigable inline custom dropdown panels using Alpine.js inside TabPrompts.astro, keeping state local to the respective form inputs and removing modalSelect properties from the global store.
- Reverted radial-gradients back to a dedicated hardware-accelerated `.aurora` element (fixed div) to leverage GPU layer caching and eliminate browser tab focus dimming lag, while keeping `overscroll-behavior-y: none` on the `html` root to prevent viewport overscroll bounces.
- Fixed verified bugs: added client-side duplicate run check, made scatter chart dots focusable and touch-accessible, stripped `runsMap` from persist/export payloads, localized compact dates, and deduplicated dropdown keyboard navigation.
- Created reusable `src/components/SelectDropdown.astro` and refactored `TabPrompts.astro` to eliminate select/dropdown styling and accessibility redundancy.
- Moved `fmtDate`, `fmtDateTime`, and `fmtDateTimeCompact` date formatters from `appStore.js` into `src/utils/formatters.js` to decouple formatting utilities from state.
- Precomputed tested model IDs Set in `normalise()` and cached adjusted prompt averages in `updateRankedRows()` to eliminate loop overheads on Alpine render ticks.
- Added Intelligence vs Cost scatter plot to Models tab (`renderIntelligenceCostChart` in `svgCharts.js`) with Pareto efficiency frontier line, `MODEL_VIEW_MODES` seg toggle, and `modelsPlotHtml` getter. Blended cost = `(3*input + output) / 4`. Added unit tests in `tests/charts.test.js`.



