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
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ms)).replace(',', '');
  } catch {
    return '';
  }
};

