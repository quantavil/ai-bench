// Static configuration shared across the app. No logic here, just constants.

// Prompt categories. The first is the default when adding a prompt.
export const CATEGORIES = [
  'Reasoning',
  'Coding',
  'Math',
  'Instruction',
  'Other',
];


// Sort modes for the leaderboard.
export const SORT_MODES = [
  { id: 'adjusted', label: 'Confidence-adjusted' },
  { id: 'avg', label: 'Raw average' },
  { id: 'time', label: 'Fastest' },
  { id: 'count', label: 'Most tested' },
];

// Models tab view modes.
export const MODEL_VIEW_MODES = [
  { id: 'list', label: 'List', icon: 'icon-list' },
  { id: 'plot', label: 'IQ vs $', icon: 'icon-plot' },
  { id: 'timeline', label: 'IQ vs Date', icon: 'icon-calendar' },
];

// Leaderboard chart modes.
export const CHART_MODES = [
  { id: 'bar', label: 'Ranking' },
  { id: 'scatter', label: 'Speed/Quality' },
];

// Below this run count a model is flagged low-confidence in the UI.
export const LOW_CONFIDENCE_N = 3;

// Bayesian shrinkage pseudocount used by the 'adjusted' sort.
export const SHRINKAGE_C = 5;

// Price range presets for model filtering.
export const PRICE_RANGES = [
  { id: 'all', label: 'All Prices', min: 0, max: Infinity },
  { id: 'free', label: 'Free / Unpriced ($0.00)', min: 0, max: 0 },
  { id: 'ultra-budget', label: 'Ultra Budget ($0.01 – $0.25)', min: 0.01, max: 0.25 },
  { id: 'low-budget', label: 'Low Budget ($0.25 – $0.50)', min: 0.25, max: 0.50 },
  { id: 'budget', label: 'Budget ($0.50 – $1.00)', min: 0.50, max: 1.00 },
  { id: 'economy', label: 'Economy ($1.00 – $2.50)', min: 1.00, max: 2.50 },
  { id: 'mid', label: 'Mid-Range ($2.50 – $5.00)', min: 2.50, max: 5.00 },
  { id: 'upper-mid', label: 'Upper Mid ($5.00 – $10.00)', min: 5.00, max: 10.00 },
  { id: 'high', label: 'High End ($10.00 – $20.00)', min: 10.00, max: 20.00 },
  { id: 'flagship', label: 'Flagship ($20.00+)', min: 20.00, max: Infinity },
  { id: 'custom', label: 'Custom Range...', min: null, max: null },
];

export const COST_BASIS_OPTIONS = [
  { id: 'blended', label: 'Blended (3:1)' },
  { id: 'input', label: 'Input Price Only' },
  { id: 'output', label: 'Output Price Only' },
];

// How long an undo toast stays actionable, in milliseconds.
export const UNDO_WINDOW_MS = 7000;
