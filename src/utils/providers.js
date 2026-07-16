// Maps a provider name to a stable brand-ish colour, Artificial-Analysis style.
// Colours are mid-tone so they read on both light and dark backgrounds.

const MAP = {
  openai: '#10a37f',
  anthropic: '#d97757',
  google: '#8b5cf6',
  'google deepmind': '#8b5cf6',
  deepmind: '#8b5cf6',
  meta: '#0866ff',
  mistral: '#fa5310',
  'mistral ai': '#fa5310',
  xai: '#8a8f98',
  deepseek: '#4d6bfe',
  alibaba: '#722ed1',
  qwen: '#722ed1',
  minimax: '#ff5e00',
  'z.ai': '#0066ff',
  xiaomi: '#ff6700',
  baidu: '#2932e1',
  bytedance: '#3c8dff',
  tencent: '#0052d9',
  moonshot: '#ff4d4f',
  zhipu: '#1890ff',
  baichuan: '#00c250',
  cohere: '#ff7759',
  microsoft: '#00a4ef',
  amazon: '#ff9900',
  aws: '#ff9900',
  perplexity: '#20b8cd',
  nvidia: '#76b900',
  reka: '#e0567f',
  ai21: '#e0567f',
};

// Deterministic HSL fallback so an unknown provider always gets the same colour.
function fallback(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 60% 50%)`;
}

export function providerColor(name) {
  if (!name) return fallback('unknown');
  const key = String(name).trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  const hit = Object.keys(MAP)
    .filter(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(key))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? MAP[hit] : fallback(key);
}
