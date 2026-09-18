// Reference data (R-03, R-15, R-21) lives in the "reference" container as one JSON array per entity plus _manifest.json.
// It is written only by the admin import (Admin screen or backend/api/tools/import_reference.mjs, fed by the NESTMS export; lab results are typed in, there is no LIMS integration)
// and read by the API for the context cascade and the reference-integrity check before any write.
// Until the first import, the API serves the bundled demo set and says so in /api/reference/status.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { config } from '../config.js';
import { blob } from './blob.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo_dataset.json', import.meta.url)));
const bundleSchema = JSON.parse(readFileSync(new URL('../data/reference_bundle.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const validateBundle = ajv.compile(bundleSchema);

export const demoUsers = demo.users;
export const demoDataset = demo;
export const ENTITIES = { projects: 'projects.json', ars: 'ars.json', trials: 'trials.json', variants: 'variants.json', samples: 'samples.json', plans: 'plans.json', users: 'users.json' };
const C = config.storage.containers;
const CACHE_MS = 60_000;

export function demoBundle() {
  return { projects: demo.projects, ars: demo.ars, trials: demo.trials, variants: demo.variants, samples: demo.samples, plans: demo.plans, users: demo.users };
}

let cache = { at: 0, data: null, manifest: null };

async function load(force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache;
  if (config.localMode) {
    if (!cache.data) cache = { at: Date.now(), data: index(demoBundle()), manifest: manifestFor(demoBundle(), 'DEMO_SEED', 'seed') };
    cache.at = Date.now();
    return cache;
  }
  const manifest = await blob.getJson(C.reference, '_manifest.json');
  if (!manifest) { cache = { at: Date.now(), data: index(demoBundle()), manifest: manifestFor(demoBundle(), 'DEMO_SEED', 'seed') }; return cache; }
  const bundle = {};
  for (const [entity, file] of Object.entries(ENTITIES)) bundle[entity] = (await blob.getJson(C.reference, file)) || [];
  cache = { at: Date.now(), data: index(bundle), manifest };
  return cache;
}

function index(b) {
  return {
    projects: b.projects || [], ars: b.ars || [], trials: b.trials || [], variants: b.variants || [], samples: b.samples || [], plans: b.plans || [], users: b.users || [],
    sampleByCode: new Map((b.samples || []).map((s) => [s.sampleCode, s])),
    variantById: new Map((b.variants || []).map((v) => [v.variantId, v])),
    arByNumber: new Map((b.ars || []).map((a) => [a.arNumber, a])),
  };
}
function manifestFor(bundle, source, updatedBy) {
  return { source, updatedAt: new Date().toISOString(), updatedBy, exportedAt: bundle.exportedAt || null,
    entities: Object.fromEntries(Object.keys(ENTITIES).map((e) => [e, { count: (bundle[e] || []).length, blob: `${C.reference}/${ENTITIES[e]}` }])) };
}

export const reference = {
  async projects() { const { data } = await load(); return data.projects.filter((p) => p.status !== 'CLOSED'); },
  async ars(projectCode) { const { data } = await load(); return data.ars.filter((a) => a.projectCode === projectCode); },
  async trials(arNumber) { const { data } = await load(); return data.trials.filter((t) => t.arNumber === arNumber); },
  async variants(arNumber, trialNumber) { const { data } = await load(); return data.variants.filter((v) => v.arNumber === arNumber && v.trialNumber === trialNumber); },
  async samples(variantId) { const { data } = await load(); return data.samples.filter((s) => s.variantId === variantId); },
  async plan(arNumber) { const { data } = await load(); const ps = data.plans.filter((p) => p.arNumber === arNumber); return ps.length ? ps.reduce((a, b) => (b.planVersion > a.planVersion ? b : a)) : null; },
  async plans() { const { data } = await load(); return data.plans; },
  async users() { const { data } = await load(); return data.users; },
  // Reference integrity before any write (the Blob equivalent of foreign keys)
  async contextExists(ctx) {
    const { data } = await load();
    const s = data.sampleByCode.get(ctx.sampleCode);
    const v = s && data.variantById.get(s.variantId);
    const a = v && data.arByNumber.get(v.arNumber);
    return !!(s && v && a && a.projectCode === ctx.projectCode && v.arNumber === ctx.arNumber && v.trialNumber === ctx.trialNumber && s.conditionCode === ctx.conditionCode);
  },
  async status() { const { manifest } = await load(); return manifest; },
  // Admin import: validate against the generated JSON Schema, check parent/child integrity, write one blob per entity, then the manifest last
  async importBundle(bundle, actor, source = 'ADMIN_UPLOAD') {
    if (!validateBundle(bundle)) { const e = new Error('Reference bundle failed schema validation'); e.status = 400; e.details = validateBundle.errors.slice(0, 20).map((x) => `${x.instancePath || '/'} ${x.message}`); throw e; }
    const problems = [];
    const pc = new Set(bundle.projects.map((p) => p.projectCode)); const ar = new Set(bundle.ars.map((a) => a.arNumber));
    const tr = new Set(bundle.trials.map((t) => `${t.arNumber}|${t.trialNumber}`)); const vr = new Set(bundle.variants.map((v) => v.variantId));
    bundle.ars.forEach((a) => { if (!pc.has(a.projectCode)) problems.push(`AR ${a.arNumber} references unknown project ${a.projectCode}`); });
    bundle.trials.forEach((t) => { if (!ar.has(t.arNumber)) problems.push(`Trial ${t.trialNumber} references unknown AR ${t.arNumber}`); });
    bundle.variants.forEach((v) => { if (!tr.has(`${v.arNumber}|${v.trialNumber}`)) problems.push(`Variant ${v.variantId} references unknown trial ${v.arNumber}/${v.trialNumber}`); });
    bundle.samples.forEach((s) => { if (!vr.has(s.variantId)) problems.push(`Sample ${s.sampleCode} references unknown variant ${s.variantId}`); });
    bundle.plans.forEach((p) => { if (!ar.has(p.arNumber)) problems.push(`Plan ${p.planId} references unknown AR ${p.arNumber}`); });
    if (problems.length) { const e = new Error('Reference bundle failed integrity checks'); e.status = 400; e.details = problems.slice(0, 20); throw e; }
    const full = { users: [], ...bundle };
    if (!config.localMode) {
      for (const [entity, file] of Object.entries(ENTITIES)) await blob.putJson(C.reference, file, full[entity] || [], { metadata: { entity, count: String((full[entity] || []).length), source } });
    }
    const manifest = manifestFor(full, source, actor.userId);
    if (!config.localMode) await blob.putJson(C.reference, '_manifest.json', manifest);
    cache = { at: Date.now(), data: index(full), manifest };
    return manifest;
  },
};
