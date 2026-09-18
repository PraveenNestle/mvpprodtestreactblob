// Robustness against intermittent tablet connectivity in the lab (R-36).
// Drafts and unsent submissions are kept locally and flushed when the browser reports it is back online.
// Storage access is wrapped so the app still works where web storage is unavailable.

const KEY_DRAFTS = 'sdct.drafts.v1';
const KEY_QUEUE = 'sdct.queue.v1';
const mem = {};

function read(key) {
  try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) : (mem[key] || null); } catch { return mem[key] || null; }
}
function write(key, value) {
  mem[key] = value;
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: memory only */ }
}

export function saveDraft(draftKey, draft) {
  const all = read(KEY_DRAFTS) || {};
  all[draftKey] = { ...draft, savedAt: new Date().toISOString() };
  write(KEY_DRAFTS, all);
}
export function loadDraft(draftKey) { return (read(KEY_DRAFTS) || {})[draftKey] || null; }
export function clearDraft(draftKey) { const all = read(KEY_DRAFTS) || {}; delete all[draftKey]; write(KEY_DRAFTS, all); }
export function listDrafts() { return read(KEY_DRAFTS) || {}; }

export function enqueue(item) { const q = read(KEY_QUEUE) || []; q.push({ ...item, queuedAt: new Date().toISOString() }); write(KEY_QUEUE, q); return q.length; }
export function queued() { return read(KEY_QUEUE) || []; }
export function dequeue(id) { write(KEY_QUEUE, (read(KEY_QUEUE) || []).filter((x) => x.id !== id)); }

export function onConnectivity(handler) {
  const on = () => handler(true); const off = () => handler(false);
  globalThis.addEventListener?.('online', on); globalThis.addEventListener?.('offline', off);
  return () => { globalThis.removeEventListener?.('online', on); globalThis.removeEventListener?.('offline', off); };
}
