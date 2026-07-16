# The Bench

A personal dashboard for benchmarking AI models. You define a **prompt once** and log how each model did against it (score 0-100, response time, and optional answer). Models are ranked on a leaderboard by average score, per category, with a bar chart coloured by provider and a speed-vs-quality scatter.

Astro + Tailwind CSS v4 + Alpine.js, deployed on Cloudflare Pages with Pages Functions and one KV namespace. Locally built using Bun.

## Project structure

```
.
├── dist/                      # production output from build step
├── src/
│   ├── pages/
│   │   └── index.astro        # Astro page entrypoint (boots Alpine store)
│   ├── components/            # modular components (Header, Nav, dialogs)
│   ├── styles/
│   │   └── index.css          # unified Tailwind v4 + glass styles
│   ├── store/
│   │   └── appStore.js        # Alpine component: state + all actions
│   ├── api/
│   │   └── client.js          # client network fetch layer
│   ├── charts/
│   │   └── svgCharts.js       # SVG/DOM bar & scatter renderers
│   └── utils/
│       ├── config.js          # categories, limits, & weights
│       ├── ranking.js         # leaderboard ranking math
│       ├── providers.js       # brand color helpers
│       └── formatters.js      # string and uid formatting utilities
├── functions/
│   └── api/
│       ├── _shared.js         # validation, KV helpers, AA helpers
│       ├── data.js            # GET/POST dataset (KV + version guard)
│       ├── sync.js            # POST sync models from Artificial Analysis
│       └── test-aa.js         # POST probe user-supplied AA API key
├── tests/                     # bun:test unit tests
├── astro.config.mjs
├── package.json
└── README.md
```

### Installation & Local Dev

Install dependencies:
```bash
bun install
```

Start the Astro development server:
```bash
bun run dev
```

Build the production assets:
```bash
bun run build
```

Run unit tests:
```bash
bun test
```

## Data model

The dataset is one JSON blob in KV under the key `dataset`, prompt-first:

```json
{
  "version": 12,
  "models":  [{ "id": "...", "name": "Claude Opus 4.8", "provider": "Anthropic" }],
  "prompts": [{
    "id": "...", "text": "...", "category": "Coding", "createdAt": 1720000000000,
    "runs": [{ "id": "...", "modelId": "...", "score": 92, "time": 3.1, "answer": "...", "createdAt": 1720000000000 }]
  }]
}
```

One run per model per prompt. A model's leaderboard average is the mean of its scores across every run in the selected category. `answer` is the raw model response.

**Ranking:** the leaderboard sorts by confidence-adjusted score by default (Bayesian shrinkage toward the global mean, so a single lucky 100 does not outrank a solid sample). Cycle sort mode for raw average, fastest, or most-tested. Models under 3 runs are flagged `low n`.

## Features

- **Leaderboard**: ranking bar chart and a speed-vs-quality scatter (avg time vs confidence-adjusted score), provider-coloured, per category.
- **Coverage grid**: prompts as rows, models as columns; each cell is the score if run, or a one-click entry point if not. Makes gaps obvious and logging fast.
- **Model sync**: Settings → paste your Artificial Analysis API key → Test / Save → Sync Models. The key is stored only in this browser (`localStorage`), never in KV or the repo.
- **Undo on delete**: deleting a prompt or run leaves a short undo window.
- **Import / export**: export the full dataset as JSON; import replaces it entirely (with confirmation, no merge).

## Multi-device: read anywhere, edit on one

Every write carries the `version` it last loaded. The server compares it against the stored version and rejects stale writes with a `409` conflict response. Note that because Cloudflare KV is eventually consistent and lacks atomic transactions/locks, this version guard reduces, but does not entirely eliminate, the chance of concurrent clobbering (it is subject to TOCTOU race conditions). Keep edits on one device at a time.

The AA API key is per-browser. On a second device, set the key again in Settings before syncing.

## Config expected by the Pages Function

| Thing | Name |
|---|---|
| KV binding | `BENCH_KV` |

Set the KV binding in the Cloudflare dashboard. The Artificial Analysis API key is **not** a server secret — each user (you) sets it in the app Settings UI.

## Run it locally

The API is a Pages Function, so a plain static server (or opening `dist/index.html` from disk) will show the gate but cannot serve `/api/data`. Opening the file directly over `file://` also blocks ES-module loading and shows a blank page with a failsafe message. Use Wrangler, which runs the Function plus a local KV:

```bash
bun run build
bunx wrangler pages dev dist --kv BENCH_KV      # serves built assets + Functions + local KV
```

Then open the printed localhost URL. Open **Settings**, paste your AA key, **Test key**, then **Sync Now**.

## Setup (Cloudflare Pages)

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "The Bench"
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

### 2. Create the KV namespace

Dashboard: **Storage & Databases** > **KV** > **Create a namespace** (e.g. `bench-data`). Or `npx wrangler kv namespace create bench-data`. You only need it to exist; the binding happens in step 5.

### 3. Connect the repo to Cloudflare Pages

**Workers & Pages** > **Create** > **Pages** > **Connect to Git**, pick the repo. Build settings:
- Framework preset: `None`
- Build command: `bun run build`
- Build output directory: `dist`

Cloudflare compiles the project using Astro, and auto-detects `functions/api/*.js` as Pages Functions. Every push to `main` redeploys. The API returns 500 until steps 4 and 5 are done.

### 4. Bind the KV namespace

Pages project > **Settings** > **Bindings** > add a **KV namespace** binding:
- Variable name `BENCH_KV` (exactly this), namespace from step 2.

### 5. Redeploy

Bindings apply on the next deploy. **Deployments** > **Retry deployment**, or push a commit.

## API

```
GET  /api/data     -> { version, models, prompts, lastSyncedAt }
POST /api/data     -> { ok: true, version }
                   body: { version, models, prompts, lastSyncedAt? }   (409 on version conflict)

POST /api/sync     -> { ok, version, models, prompts, lastSyncedAt }
                   body: { version, apiKey }   (apiKey required; 401 if AA rejects key)

POST /api/test-aa  -> { ok: true, message } | { ok: false, error }
                   body: { apiKey }            (does not touch KV)
```

Server-side validation clamps scores to 0-100, requires non-negative times, requires name + provider per model (non-whitespace), requires every run to reference a known model, forbids two runs for the same model on one prompt, caps `answer` length, and caps payload size by actual body bytes.

## Notes

- Single-user by design. The version guard prevents cross-device clobbering but is not a locking or merge system.
- Cloudflare KV is eventually consistent (up to ~60s across locations); a second device may briefly read stale data after a write.
- `x-html` is used only for chart SVG/HTML rendering. All other user text uses `x-text`.
- If you previously used a hardcoded or env-level AA key that may have been exposed, rotate it in the Artificial Analysis dashboard.
