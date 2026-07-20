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
  { id: 'plot', label: 'Intelligence vs Cost', icon: 'icon-plot' },
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

// How long an undo toast stays actionable, in milliseconds.
export const UNDO_WINDOW_MS = 7000;
