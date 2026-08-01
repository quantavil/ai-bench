// Shared utility functions.

export const uid = () => crypto.randomUUID();

export const fmt1 = (n) =>
  (Math.round(n * 10) / 10).toFixed(1);

export const fmtDate = (ms) => {
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

export const fmtDateTime = (ms) => {
  if (!ms) return 'Never';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Never';
  }
};

export const fmtDateTimeCompact = (ms) => {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
};

