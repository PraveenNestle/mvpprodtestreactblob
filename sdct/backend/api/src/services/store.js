import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { config } from '../config.js';
import { blob } from './blob.js';
import { reference, demoDataset } from './reference.js';
import { standardFilename, mediaBlobPath, observationBlobPath } from './naming.js';

const catalogJson = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const schema = JSON.parse(readFileSync(new URL('../data/observation.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const validateDoc = ajv.compile(schema);
const fieldIndex = Object.fromEntries(catalogJson.fields.map((f) => [f.fieldCode, f]));
const C = config.storage.containers;
export const FILENAME_RE = /^[A-Z0-9]+(_[A-Z0-9-]+){6,8}_[0-9]{8}-[0-9]{6}_[0-9]{2}\.[a-z0-9]+$/;

// ---------------------------------------------------------------------------------------------- in-memory index (LOCAL_MODE only)
const local = { observations: config.localMode ? demoDataset.observations.map((o) => ({ ...o, storage: { container: C.observations, blobPath: observationBlobPath(o.context, o.observationId) } })) : [], audit: config.localMode ? [...demoDataset.auditLog] : [], templates: null, vocabularies: null };

// ---------------------------------------------------------------------------------------------- config (templates, vocabularies)
export const configStore = {
  async catalog() { const vocabularies = (await this.vocabularies()); const templates = await this.templates(); return { ...catalogJson, vocabularies, templates }; },
  async vocabularies() {
    if (local.vocabularies) return local.vocabularies;
    const stored = await blob.getJson(C.config, 'vocabularies.json');
    local.vocabularies = stored || JSON.parse(JSON.stringify(catalogJson.vocabularies));
    return local.vocabularies;
  },
  async saveVocabularies(v, actor, entityId) { local.vocabularies = v; await blob.putJson(C.config, 'vocabularies.json', v); await audit.log({ actor, action: 'CONFIG_CHANGE', entityType: 'VOCABULARY', entityId }); },
  async templates() {
    if (local.templates) return local.templates;
    const names = await blob.list(C.config, 'templates/');
    const stored = (await Promise.all(names.map((n) => blob.getJson(C.config, n)))).filter(Boolean);
    local.templates = stored.length ? stored : catalogJson.templates.map((t) => ({ ...t, createdBy: 'SEED', createdAt: catalogJson.generatedAt }));
    return local.templates;
  },
  async saveTemplate(t, actor) {
    const all = await this.templates();
    const versions = all.filter((x) => x.templateId === t.templateId);
    const version = versions.length ? Math.max(...versions.map((x) => x.version)) + 1 : 1;
    const bad = t.sections.flatMap((s) => s.fields).filter((c) => !fieldIndex[c]);
    if (bad.length) { const e = new Error(`Unknown field codes: ${bad.join(', ')}`); e.status = 400; throw e; }
    const saved = { ...t, version, createdBy: actor.userId, createdAt: new Date().toISOString() };
    if (saved.status === 'ACTIVE') all.forEach((x) => { if (x.templateId === saved.templateId && x.status === 'ACTIVE') x.status = 'RETIRED'; });
    all.push(saved); local.templates = all;
    await blob.putJson(C.config, `templates/${saved.templateId}/v${version}.json`, saved);
    for (const x of all.filter((y) => y.templateId === saved.templateId && y.version !== version)) await blob.putJson(C.config, `templates/${x.templateId}/v${x.version}.json`, x);
    await audit.log({ actor, action: 'CONFIG_CHANGE', entityType: 'TEMPLATE', entityId: saved.templateId, entityVersion: version });
    return saved;
  },
};

// ---------------------------------------------------------------------------------------------- audit (R-31, R-32)
export const audit = {
  async log({ actor, action, entityType, entityId, entityVersion = null, correlationId = null, detail = null }) {
    const row = { auditId: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, eventTime: new Date().toISOString(), actorUserId: actor.userId, actorName: actor.displayName, actorRole: actor.role, action, entityType, entityId, entityVersion, correlationId, detail };
    local.audit.unshift(row); if (local.audit.length > 5000) local.audit.length = 5000;
    await blob.appendNdjson('audit_log', [row]);
    return row;
  },
  async recent(limit = 100) {
    if (config.localMode) return local.audit.slice(0, limit);
    const rows = await blob.readNdjson('audit_log');
    return rows.sort((a, b) => (a.eventTime < b.eventTime ? 1 : -1)).slice(0, limit);
  },
};

// ---------------------------------------------------------------------------------------------- observations
function toCurated(doc, blobRes) {
  const c = doc.context;
  const header = { observationId: doc.observationId, versionNo: doc.versionNo, isCurrent: true, status: doc.status, projectCode: c.projectCode, arNumber: c.arNumber, trialNumber: c.trialNumber, variantId: c.variantId, variantNumber: c.variantNumber, sampleCode: c.sampleCode, timePointCode: c.timePointCode, conditionCode: c.conditionCode, formulationClass: c.formulationClass, planId: c.planId, planVersion: c.planVersion, templateId: doc.template.templateId, templateVersion: doc.template.templateVersion, resultType: doc.resultType, overallResult: doc.overallResult, overallResultNA: doc.overallResultNA, observerUserId: doc.observer.userId, observerName: doc.observer.displayName, observedAt: doc.observedAt, submittedAt: doc.submittedAt, reviewedBy: doc.reviewedBy || null, reviewedAt: doc.reviewedAt || null, mediaCount: doc.media.length, blobPath: observationBlobPath(c, doc.observationId), blobVersionId: blobRes?.versionId || null, appendedAt: new Date().toISOString(),
    excludeFromTrend: doc.values.some((v) => v.fieldCode === 'exclude_from_trend' && v.value === true), shakeProtocol: doc.values.find((v) => v.fieldCode === 'shake_protocol')?.value || null };
  const values = doc.values.map((v) => ({ observationId: doc.observationId, versionNo: doc.versionNo, fieldCode: v.fieldCode, domainCode: v.domainCode, dataType: v.dataType, valueText: v.isNA ? null : (v.value === null || v.value === undefined ? null : Array.isArray(v.value) ? v.value.join('|') : String(v.value)), valueNumber: !v.isNA && typeof v.value === 'number' ? v.value : null, valueBoolean: !v.isNA && typeof v.value === 'boolean' ? v.value : null, unit: v.unit, isNA: v.isNA, naReason: v.naReason, mediaAssetId: v.mediaAssetId, sampleCode: c.sampleCode, timePointCode: c.timePointCode, conditionCode: c.conditionCode, arNumber: c.arNumber, projectCode: c.projectCode, observedAt: doc.observedAt }));
  const media = doc.media.map((m) => ({ ...m, observationId: doc.observationId, versionNo: doc.versionNo, sampleCode: c.sampleCode, timePointCode: c.timePointCode, conditionCode: c.conditionCode, arNumber: c.arNumber, projectCode: c.projectCode }));
  return { header, values, media };
}

// Per-AR index of current observation headers: observations/_index/{AR}.json. Lists never scan the curated NDJSON or the document tree.
const INDEX_PREFIX = '_index/';
const indexPath = (arNumber) => `${INDEX_PREFIX}${String(arNumber).toUpperCase().replace(/[^A-Z0-9-]/g, '')}.json`;
async function updateIndex(arNumber, mutate) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await blob.getJsonWithEtag(C.observations, indexPath(arNumber));
    const idx = doc || { arNumber, updatedAt: null, observations: {} };
    mutate(idx); idx.updatedAt = new Date().toISOString();
    try { await blob.putJson(C.observations, indexPath(arNumber), idx, etag ? { ifMatch: etag } : { ifNoneMatch: '*' }); return idx; } catch (e) { if (![409, 412].includes(e.statusCode)) throw e; }
  }
  throw new Error('Index update kept conflicting; try again');
}
function headerFor(doc, blobRes) { return { ...toCurated(doc, blobRes).header }; }

export const observations = {
  async list(filters = {}) {
    if (config.localMode) {
      let rows = local.observations;
      if (filters.projectCode) rows = rows.filter((o) => o.context.projectCode === filters.projectCode);
      if (filters.arNumber) rows = rows.filter((o) => o.context.arNumber === filters.arNumber);
      if (filters.trialNumber) rows = rows.filter((o) => o.context.trialNumber === filters.trialNumber);
      if (filters.status) rows = rows.filter((o) => o.status === filters.status);
      return rows;
    }
    const indexNames = filters.arNumber ? [indexPath(filters.arNumber)] : await blob.list(C.observations, INDEX_PREFIX);
    let headers = (await Promise.all(indexNames.map((n) => blob.getJson(C.observations, n)))).filter(Boolean).flatMap((idx) => Object.values(idx.observations));
    if (filters.projectCode) headers = headers.filter((h) => h.projectCode === filters.projectCode);
    if (filters.trialNumber) headers = headers.filter((h) => h.trialNumber === filters.trialNumber);
    if (filters.status) headers = headers.filter((h) => h.status === filters.status);
    headers.sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1));
    const limit = Math.min(Number(filters.limit) || 500, 2000);
    const docs = await Promise.all(headers.slice(0, limit).map((h) => blob.getJson(C.observations, h.blobPath)));
    return docs.filter(Boolean);
  },
  async get(observationId, arHint) {
    if (config.localMode) return local.observations.find((o) => o.observationId === observationId) || null;
    const indexNames = arHint ? [indexPath(arHint)] : await blob.list(C.observations, INDEX_PREFIX);
    for (const n of indexNames) {
      const idx = await blob.getJson(C.observations, n);
      const h = idx?.observations?.[observationId];
      if (h) return blob.getJson(C.observations, h.blobPath);
    }
    return null;
  },

  // Media upload grants: the API computes the standard filename itself and only signs that exact path (R-22, OI-4)
  async uploadGrants(observationId, items) {
    return Promise.all(items.map(async (m) => {
      if (!FILENAME_RE.test(m.blobPath.split('/').pop())) { const e = new Error(`Filename does not follow the naming convention: ${m.blobPath}`); e.status = 400; throw e; }
      const sas = await blob.uploadSas(m.blobPath, m.contentType);
      return { mediaAssetId: m.mediaAssetId, blobPath: m.blobPath, ...sas };
    }));
  },

  // Submit: validate -> verify context -> verify media -> write document (create-only) -> curated rows -> audit. Any failure after the write removes the document (R-35).
  async submit(doc, actor, { historical = false } = {}) {
    doc.status = historical ? 'REVIEWED' : doc.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';
    doc.submittedAt = doc.submittedAt || new Date().toISOString();
    doc.observer = { userId: actor.userId, displayName: actor.displayName, upn: actor.upn, role: actor.role }; // never trust the client's identity claim
    if (!validateDoc(doc)) { const e = new Error('Observation failed schema validation'); e.status = 400; e.details = validateDoc.errors.slice(0, 20).map((x) => `${x.instancePath || '/'} ${x.message}`); throw e; }
    // Semantic checks the JSON Schema cannot express
    const problems = [];
    doc.values.forEach((v) => {
      const f = fieldIndex[v.fieldCode];
      if (!f) return problems.push(`Unknown field ${v.fieldCode}`);
      if (v.isNA && !f.allowNA) problems.push(`${f.label}: N/A is not allowed`);
      if (!v.isNA && String(v.value) === '9999') problems.push(`${f.label}: 9999 placeholder is not allowed, use N/A`);
      if (f.dataType === 'percent' && !v.isNA && (v.value < 0 || v.value > 100)) problems.push(`${f.label}: percent out of range`);
    });
    if (doc.status === 'SUBMITTED' && !historical) { // spreadsheet history has no photos
      const required = catalogJson.fields.filter((f) => f.requiredDefault && !f.isHeader && f.dataType !== 'ref' && f.domainCode === 'GENERAL_MEDIA');
      required.forEach((f) => { if (!doc.values.some((v) => v.fieldCode === f.fieldCode && !v.isNA)) problems.push(`${f.label} is required`); });
      if (!doc.overallResult && !doc.overallResultNA) problems.push('Overall result is required');
    }
    if (problems.length) { const e = new Error('Observation failed business validation'); e.status = 400; e.details = problems; throw e; }
    if (!(await reference.contextExists(doc.context))) { const e = new Error('Context does not match the reference data (project / AR / trial / sample / condition)'); e.status = 400; throw e; }
    // Media proof: every referenced blob must exist under the convention path before the record is written
    for (const m of doc.media) {
      const expectedPrefix = mediaBlobPath(doc.context, '').replace(/\/$/, '');
      if (!m.blobPath.startsWith(expectedPrefix + '/') || !FILENAME_RE.test(m.standardFilename) || !m.blobPath.endsWith('/' + m.standardFilename)) { const e = new Error(`Media path does not match the naming convention: ${m.blobPath}`); e.status = 400; throw e; }
      const p = await blob.mediaProperties(m.blobPath);
      if (!p.exists) { const e = new Error(`Media not found in storage: ${m.standardFilename}. Upload it first, then submit.`); e.status = 409; throw e; }
      if (p.contentLength) m.sizeBytes = p.contentLength;
      if (p.contentMD5) m.checksumMd5 = p.contentMD5;
      m.blobUri = `https://${config.storage.accountName || 'local'}.blob.core.windows.net/${C.media}/${m.blobPath}`;
    }
    // Versioning: a resubmission of an existing observationId becomes versionNo + 1 and points at the previous document version
    const existing = await this.get(doc.observationId, doc.context.arNumber);
    if (existing) {
      if (existing.observer.userId !== actor.userId && actor.role === 'SCIENTIST') { const e = new Error('Only the original observer or a reviewer can amend this observation'); e.status = 403; throw e; }
      doc.versionNo = existing.versionNo + 1; doc.audit = { ...doc.audit, previousVersionUri: existing.storage?.blobPath || observationBlobPath(existing.context, existing.observationId), previousVersionId: existing.storage?.versionId || null };
    } else doc.versionNo = 1;
    const path = observationBlobPath(doc.context, doc.observationId);
    let written = null;
    try {
      written = await blob.putJson(C.observations, path, doc, { metadata: { observationid: doc.observationId, version: String(doc.versionNo), project: doc.context.projectCode, ar: doc.context.arNumber, status: doc.status }, ifNoneMatch: existing ? undefined : '*' });
      const cur = toCurated(doc, written);
      if (existing) cur.header.previousVersionNo = existing.versionNo;
      await blob.appendNdjson('observation_header', [cur.header]);
      await blob.appendNdjson('observation_value', cur.values);
      await blob.appendNdjson('media_asset', cur.media);
      await audit.log({ actor, action: existing ? 'UPDATE' : 'CREATE', entityType: 'OBSERVATION', entityId: doc.observationId, entityVersion: doc.versionNo, correlationId: doc.audit?.correlationId || null });
      for (const m of doc.media) await audit.log({ actor, action: 'MEDIA_UPLOAD', entityType: 'MEDIA_ASSET', entityId: m.mediaAssetId, correlationId: doc.audit?.correlationId || null, detail: m.standardFilename });
      if (!config.localMode) await updateIndex(doc.context.arNumber, (idx) => { idx.observations[doc.observationId] = headerFor(doc, written); });
    } catch (err) {
      if (written && !existing) await blob.deleteBlob(C.observations, path); // compensate: no half-written record
      throw err;
    }
    const stored = { ...doc, storage: { container: C.observations, blobPath: path, versionId: written.versionId } };
    if (config.localMode) { const i = local.observations.findIndex((o) => o.observationId === doc.observationId); if (i >= 0) local.observations[i] = stored; else local.observations.unshift(stored); }
    return { ok: true, observationId: doc.observationId, versionNo: doc.versionNo, blobPath: path, versionId: written.versionId };
  },

  async review(observationId, action, actor, note) {
    const doc = await this.get(observationId);
    if (!doc) { const e = new Error('Observation not found'); e.status = 404; throw e; }
    if (doc.status !== 'SUBMITTED') { const e = new Error(`Observation is ${doc.status}, only SUBMITTED observations can be reviewed`); e.status = 409; throw e; }
    doc.status = action === 'REJECT' ? 'REJECTED' : 'REVIEWED'; doc.reviewedBy = actor.userId; doc.reviewedAt = new Date().toISOString(); doc.reviewNote = note || null;
    const path = observationBlobPath(doc.context, doc.observationId);
    const { storage, ...clean } = doc;
    const written = await blob.putJson(C.observations, path, clean, { metadata: { observationid: doc.observationId, version: String(doc.versionNo), status: doc.status } });
    await blob.appendNdjson('observation_header', [toCurated(clean, written).header]);
    await audit.log({ actor, action: action === 'REJECT' ? 'REJECT' : 'REVIEW', entityType: 'OBSERVATION', entityId: observationId, entityVersion: doc.versionNo, correlationId: doc.audit?.correlationId || null, detail: note || null });
    if (!config.localMode) await updateIndex(clean.context.arNumber, (idx) => { idx.observations[observationId] = headerFor(clean, written); });
    const stored = { ...clean, storage: { container: C.observations, blobPath: path, versionId: written.versionId } };
    if (config.localMode) { const i = local.observations.findIndex((o) => o.observationId === observationId); if (i >= 0) local.observations[i] = stored; }
    return stored;
  },

  toCsv(list) {
    const head = ['observationId', 'versionNo', 'status', 'projectCode', 'arNumber', 'trialNumber', 'variantNumber', 'sampleCode', 'timePointCode', 'conditionCode', 'observedAt', 'observer', 'overallResult', 'fieldCode', 'domainCode', 'value', 'unit', 'isNA', 'mediaAssetId'];
    const esc = (v) => { const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('|') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head.join(',')];
    list.forEach((o) => o.values.forEach((v) => lines.push([o.observationId, o.versionNo, o.status, o.context.projectCode, o.context.arNumber, o.context.trialNumber, o.context.variantNumber, o.context.sampleCode, o.context.timePointCode, o.context.conditionCode, o.observedAt, o.observer.displayName, o.overallResult, v.fieldCode, v.domainCode, v.isNA ? 'N/A' : v.value, v.unit, v.isNA, v.mediaAssetId].map(esc).join(','))));
    return lines.join('\n');
  },
};

export { catalogJson, fieldIndex, standardFilename };
