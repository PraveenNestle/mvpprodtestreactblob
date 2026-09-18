import catalogJson from '../data/catalog.json';
import * as demo from './demoData.js';
import { uuid } from '../lib/format.js';
import { observationBlobPath } from '../lib/naming.js';
import { getAccessToken } from '../auth/auth.js';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export const DEMO_MODE = !API_BASE;

// -------------------------------------------------------------------------------------------------
// Demo implementation: everything in memory, same shapes as the Express API
// -------------------------------------------------------------------------------------------------
const state = {
  templates: catalogJson.templates.map((t) => ({ ...t, createdBy: 'SEED', createdAt: '2026-06-01T00:00:00Z' })),
  vocabularies: JSON.parse(JSON.stringify(catalogJson.vocabularies)),
  observations: [...demo.observations],
  audit: [...demo.auditLog],
};
const delay = (v, ms = 120) => new Promise((r) => setTimeout(() => r(v), ms));

const demoApi = {
  mode: 'demo',
  async getCatalog() { return delay({ ...catalogJson, vocabularies: state.vocabularies }); },
  async getProjects() { return delay(demo.projects); },
  async getARs(projectCode) { return delay(demo.ars.filter((a) => a.projectCode === projectCode)); },
  async getTrials(arNumber) { return delay(demo.trials.filter((t) => t.arNumber === arNumber)); },
  async getVariants(arNumber, trialNumber) { return delay(demo.variants.filter((v) => v.arNumber === arNumber && v.trialNumber === trialNumber)); },
  async getSamples(variantId) { return delay(demo.samples.filter((s) => s.variantId === variantId)); },
  async getPlan(arNumber) { return delay(demo.plans.find((p) => p.arNumber === arNumber) || null); },
  async getUsers() { return delay(demo.users); },
  async listTemplates() { return delay(state.templates); },
  async saveTemplate(template, actor) {
    const existing = state.templates.filter((t) => t.templateId === template.templateId);
    const version = existing.length ? Math.max(...existing.map((t) => t.version)) + 1 : 1;
    const saved = { ...template, version, createdBy: actor.userId, createdAt: new Date().toISOString() };
    state.templates = [...state.templates.map((t) => (t.templateId === saved.templateId && t.status === 'ACTIVE' && saved.status === 'ACTIVE' ? { ...t, status: 'RETIRED' } : t)), saved];
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: saved.createdAt, actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action: 'CONFIG_CHANGE', entityType: 'TEMPLATE', entityId: saved.templateId, entityVersion: version, correlationId: `corr-${uuid().slice(0, 8)}` });
    return delay(saved);
  },
  async listObservations(filters = {}) {
    let rows = state.observations;
    if (filters.projectCode) rows = rows.filter((o) => o.context.projectCode === filters.projectCode);
    if (filters.arNumber) rows = rows.filter((o) => o.context.arNumber === filters.arNumber);
    if (filters.trialNumber) rows = rows.filter((o) => o.context.trialNumber === filters.trialNumber);
    if (filters.status) rows = rows.filter((o) => o.status === filters.status);
    return delay(rows);
  },
  async getObservation(id) { return delay(state.observations.find((o) => o.observationId === id) || null); },
  async submitObservation(doc, mediaFiles) {
    // In demo mode the media never leaves the device; the document is stored as the API would store it.
    const stored = { ...doc, submittedAt: new Date().toISOString(), status: doc.status || 'SUBMITTED', storage: { blobPath: observationBlobPath(doc.context, doc.observationId), container: 'observations' } };
    const idx = state.observations.findIndex((o) => o.observationId === doc.observationId);
    if (idx >= 0) state.observations[idx] = stored; else state.observations.unshift(stored);
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: stored.submittedAt, actorUserId: doc.observer.userId, actorName: doc.observer.displayName, actorRole: doc.observer.role, action: doc.versionNo > 1 ? 'UPDATE' : 'CREATE', entityType: 'OBSERVATION', entityId: doc.observationId, entityVersion: doc.versionNo, correlationId: doc.audit.correlationId });
    (mediaFiles || []).forEach((m) => state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: stored.submittedAt, actorUserId: doc.observer.userId, actorName: doc.observer.displayName, actorRole: doc.observer.role, action: 'MEDIA_UPLOAD', entityType: 'MEDIA_ASSET', entityId: m.mediaAssetId, entityVersion: null, correlationId: doc.audit.correlationId }));
    return delay({ ok: true, observationId: doc.observationId, versionNo: doc.versionNo, blobPath: stored.storage.blobPath }, 400);
  },
  async reviewObservation(id, action, actor, note) {
    const o = state.observations.find((x) => x.observationId === id);
    if (!o) throw new Error('Observation not found');
    o.status = action === 'REJECT' ? 'REJECTED' : 'REVIEWED';
    o.reviewedBy = actor.userId; o.reviewedAt = new Date().toISOString(); o.reviewNote = note || null;
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: o.reviewedAt, actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action: action === 'REJECT' ? 'REJECT' : 'REVIEW', entityType: 'OBSERVATION', entityId: id, entityVersion: o.versionNo, correlationId: o.audit.correlationId });
    return delay({ ...o });
  },
  async listAudit(limit = 100) { return delay(state.audit.slice(0, limit)); },
  async addVocabularyValue(vocabularyCode, value, actor) {
    const v = state.vocabularies.find((x) => x.code === vocabularyCode);
    if (!v) throw new Error('Vocabulary not found');
    if (v.values.some((x) => x.code === value.code)) throw new Error(`Value code ${value.code} already exists`);
    v.values.push({ ...value, sortOrder: v.values.length + 1, isActive: true });
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: new Date().toISOString(), actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action: 'CONFIG_CHANGE', entityType: 'VOCABULARY', entityId: vocabularyCode, entityVersion: null, correlationId: `corr-${uuid().slice(0, 8)}` });
    return delay(v);
  },
  async toggleVocabularyValue(vocabularyCode, code, actor) {
    const v = state.vocabularies.find((x) => x.code === vocabularyCode);
    const item = v?.values.find((x) => x.code === code);
    if (item) item.isActive = !item.isActive;
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: new Date().toISOString(), actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action: 'CONFIG_CHANGE', entityType: 'VOCABULARY', entityId: `${vocabularyCode}.${code}`, entityVersion: null, correlationId: `corr-${uuid().slice(0, 8)}` });
    return delay(v);
  },
  async exportCsv(filters) {
    const rows = await this.listObservations(filters);
    return toCsv(rows);
  },
  async getReferenceStatus() {
    return delay(state.referenceManifest || (state.referenceManifest = { source: 'DEMO_SEED', updatedAt: '2026-08-31T08:00:00Z', updatedBy: 'seed', exportedAt: null,
      entities: Object.fromEntries([['projects', demo.projects], ['ars', demo.ars], ['trials', demo.trials], ['variants', demo.variants], ['samples', demo.samples], ['plans', demo.plans], ['users', demo.users]].map(([k, v]) => [k, { count: v.length, blob: `reference/${k}.json` }])) }));
  },
  async importReference(bundle, actor) {
    // Demo mode: replace the in-memory reference set in place so the cascade and plan grids pick it up immediately
    const req = ['projects', 'ars', 'trials', 'variants', 'samples', 'plans'];
    const missing = req.filter((k) => !Array.isArray(bundle?.[k]));
    if (missing.length) throw new Error(`Bundle is missing: ${missing.join(', ')}`);
    [['projects', demo.projects], ['ars', demo.ars], ['trials', demo.trials], ['variants', demo.variants], ['samples', demo.samples], ['plans', demo.plans], ['users', demo.users]].forEach(([k, arr]) => { if (Array.isArray(bundle[k])) arr.splice(0, arr.length, ...bundle[k]); });
    state.referenceManifest = { source: 'ADMIN_UPLOAD', updatedAt: new Date().toISOString(), updatedBy: actor.userId, exportedAt: bundle.exportedAt || null,
      entities: Object.fromEntries(['projects', 'ars', 'trials', 'variants', 'samples', 'plans', 'users'].map((k) => [k, { count: (bundle[k] || []).length, blob: `reference/${k}.json` }])) };
    state.audit.unshift({ auditId: `aud-${uuid().slice(0, 8)}`, eventTime: state.referenceManifest.updatedAt, actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action: 'CONFIG_CHANGE', entityType: 'REFERENCE', entityId: 'reference-bundle', entityVersion: null, correlationId: `corr-${uuid().slice(0, 8)}` });
    return delay(state.referenceManifest, 500);
  },
};

// -------------------------------------------------------------------------------------------------
// Real implementation: Express API on Azure Web App (see backend/api). Blob is the only store; media goes straight to Blob via SAS.
// -------------------------------------------------------------------------------------------------
async function http(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    throw new Error(detail || `${method} ${path} failed (${res.status})`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
const qs = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')); const s = p.toString(); return s ? `?${s}` : ''; };

const realApi = {
  mode: 'api',
  getCatalog: () => http('/api/catalog'),
  getProjects: () => http('/api/reference/projects'),
  getARs: (projectCode) => http(`/api/reference/ars${qs({ projectCode })}`),
  getTrials: (arNumber) => http(`/api/reference/trials${qs({ arNumber })}`),
  getVariants: (arNumber, trialNumber) => http(`/api/reference/variants${qs({ arNumber, trialNumber })}`),
  getSamples: (variantId) => http(`/api/reference/samples${qs({ variantId })}`),
  getPlan: (arNumber) => http(`/api/reference/plan${qs({ arNumber })}`),
  getUsers: () => http('/api/reference/users'),
  listTemplates: () => http('/api/templates'),
  saveTemplate: (template) => http('/api/templates', { method: 'POST', body: template }),
  listObservations: (filters = {}) => http(`/api/observations${qs(filters)}`),
  getObservation: (id) => http(`/api/observations/${encodeURIComponent(id)}`),
  async submitObservation(doc, mediaFiles = []) {
    // 1) ask the API for write-only SAS URLs, 2) PUT each file to Blob, 3) commit the document (the API validates and writes the record last)
    if (mediaFiles.length) {
      const grants = await http('/api/media/upload-urls', { method: 'POST', body: { observationId: doc.observationId, media: mediaFiles.map((m) => ({ mediaAssetId: m.mediaAssetId, blobPath: m.blobPath, contentType: m.contentType })) } });
      await Promise.all(mediaFiles.map(async (m) => {
        const g = grants.find((x) => x.mediaAssetId === m.mediaAssetId);
        const put = await fetch(g.uploadUrl, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': m.contentType, 'x-ms-meta-observationid': doc.observationId, 'x-ms-meta-fieldcode': m.fieldCode }, body: m.file });
        if (!put.ok) throw new Error(`Upload failed for ${m.standardFilename}`);
      }));
    }
    return http('/api/observations', { method: 'POST', body: doc });
  },
  reviewObservation: (id, action, actor, note) => http(`/api/observations/${encodeURIComponent(id)}/review`, { method: 'POST', body: { action, note } }),
  listAudit: (limit = 100) => http(`/api/audit${qs({ limit })}`),
  addVocabularyValue: (vocabularyCode, value) => http(`/api/catalog/vocabularies/${vocabularyCode}/values`, { method: 'POST', body: value }),
  toggleVocabularyValue: (vocabularyCode, code) => http(`/api/catalog/vocabularies/${vocabularyCode}/values/${code}/toggle`, { method: 'POST' }),
  exportCsv: (filters) => http(`/api/observations/export.csv${qs(filters)}`),
  getReferenceStatus: () => http('/api/reference/status'),
  importReference: (bundle) => http('/api/reference/import', { method: 'POST', body: bundle }),
};

export function toCsv(observations) {
  const head = ['observationId', 'versionNo', 'status', 'projectCode', 'arNumber', 'trialNumber', 'variantNumber', 'sampleCode', 'timePointCode', 'conditionCode', 'observedAt', 'observer', 'overallResult', 'fieldCode', 'domainCode', 'value', 'unit', 'isNA', 'mediaAssetId'];
  const esc = (v) => { const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('|') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.join(',')];
  observations.forEach((o) => o.values.forEach((v) => lines.push([o.observationId, o.versionNo, o.status, o.context.projectCode, o.context.arNumber, o.context.trialNumber, o.context.variantNumber, o.context.sampleCode, o.context.timePointCode, o.context.conditionCode, o.observedAt, o.observer.displayName, o.overallResult, v.fieldCode, v.domainCode, v.isNA ? 'N/A' : v.value, v.unit, v.isNA, v.mediaAssetId].map(esc).join(','))));
  return lines.join('\n');
}

export const api = DEMO_MODE ? demoApi : realApi;
export const catalog = catalogJson;
