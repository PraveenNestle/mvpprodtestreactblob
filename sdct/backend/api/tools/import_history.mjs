#!/usr/bin/env node
// Historical import: bring the team's stability spreadsheets (SOP 0 to 5 ratings, sediment heights, pH / viscosity, comments)
// into observation documents so trends and benchmarking start with the history already there.
//
//   node import_history.mjs --xlsx "Stability Examples.xlsx" --sheet "Benefic Stablity" --layout benefic --project PRJ-BENEFIC --ar AR-33440 [--dry-run]
//   node import_history.mjs --csv history.csv --project PRJ-X --ar AR-Y [--dry-run]         # normalized long format (columns below)
//
// Normalized long format (one row per pull per variant):
//   trialNumber, variantNumber, variantDescription, timePointCode (T0|2W|1M|...), conditionCode (4C|25C|35C|45C), observedDate (yyyy-mm-dd, optional),
//   creamUnsh, serumUnsh, sedUnsh, creamSh, serumSh, sedSh (0-5, 9999 or blank), sedUnshMm, sedShMm, ph, viscosity, viscosityShearRate, viscosityTempC, comment
//
// Output (dry run): ./history_out/observations.json and ./history_out/reference_fragment.json (trials, variants, samples, plan inferred from the rows).
// Load the reference fragment first (merge into your NESTMS bundle, then Admin > Reference data or import_reference.mjs), then run again with --write,
// which submits every document through the API store in this process (LOCAL_MODE=true for a rehearsal, Azure settings for the real load).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [])).filter((x) => x.length));
if (!args.project || !args.ar) { console.error('--project and --ar are required'); process.exit(2); }
const TP = { 'immediate': 'T0', '0': 'T0', '1 day': '1D', '1 week': '1W', '2 week': '2W', '2 weeks': '2W', '1 month': '1M', '2 month': '2M', '2 months': '2M', '3 month': '3M', '3 months': '3M', '4 month': '4M', '6 month': '6M', '6 months': '6M', '9 month': '9M', '12 month': '12M', '15 month': '15M', '18 month': '18M' };
const COND = { ambient: '25C', fridge: '4C', refrigerated: '4C', '4c': '4C', '25c': '25C', '30c': '30C', '35': '35C', '35c': '35C', '45': '45C', '45c': '45C' };
const tp = (v) => { const raw = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/mnth|mth|mo\b/g, 'month').replace(/\b(ambient|fridge|refrigerated|\d+c?)\s*$/, '').trim(); return TP[raw] || raw.toUpperCase(); };
const cond = (v) => COND[String(v ?? '').trim().toLowerCase()] || String(v ?? '').trim().toUpperCase();
const num = (v) => { if (v === null || v === undefined || v === '') return null; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const mmOf = (v) => { if (v === null || v === undefined || v === '') return null; const s = String(v); const n = num(s); if (n === null) return null; return /cm/i.test(s) ? Math.round(n * 100) / 10 : n; };

// ---- readers
function readNormalized(rows) { return rows.map((r) => ({ ...r })); }
function readBenefic(ws) {
  // Benefic layout: Trial Number | Description | pH target | time | temp | pH | viscosity | creaming | serum | sediment | sediment (cm) | Comment, trial number only on the first row of a block
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = []; let trial = null; let desc = null; let phTarget = null;
  for (const r of rows.slice(6)) {
    if (r[0] !== null && typeof r[0] === 'number') { trial = String(r[0]); desc = r[1]; phTarget = num(r[2]); }
    if (!trial || r[3] === null) continue;
    const embedded = String(r[3]).toLowerCase().match(/(ambient|fridge|refrigerated|\d+c?)\s*$/);
    out.push({ trialNumber: trial, variantNumber: 'V1', variantDescription: desc, phTarget, timePointCode: tp(r[3]), conditionCode: cond(r[4] ?? (embedded ? embedded[1] : null)), ph: num(r[5]), viscosity: num(r[6]), creamUnsh: r[7], serumUnsh: r[8], sedUnsh: r[9], sedUnshMm: mmOf(r[10]), comment: [r[11], r[13]].filter(Boolean).join(' ') || null });
  }
  return out;
}

let rows;
if (args.xlsx) {
  const wb = XLSX.readFile(args.xlsx); const ws = wb.Sheets[args.sheet || wb.SheetNames[0]];
  if (!ws) { console.error('sheet not found; available:', wb.SheetNames.join(', ')); process.exit(2); }
  rows = args.layout === 'benefic' ? readBenefic(ws) : readNormalized(XLSX.utils.sheet_to_json(ws, { defval: null }));
} else if (args.csv) {
  const wb = XLSX.read(readFileSync(args.csv, 'utf8'), { type: 'string' }); rows = readNormalized(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }));
} else { console.error('Provide --xlsx or --csv'); process.exit(2); }
rows = rows.filter((r) => r.timePointCode && r.conditionCode);

// ---- reference fragment inferred from the rows
const trials = [...new Map(rows.map((r) => [r.trialNumber, { trialNumber: String(r.trialNumber), arNumber: args.ar, trialDescription: r.variantDescription || null, formulationClass: 'LIQUID_RTD', productFormat: 'BOTTLE_PET', processScale: /^MT/i.test(r.variantDescription || '') ? 'MICROTHERMICS' : 'PILOT_PLANT', status: null, terminationReason: null }])).values()];
const variants = [...new Map(rows.map((r) => [`${r.trialNumber}|${r.variantNumber || 'V1'}`, { variantId: `VAR-${String(r.trialNumber).replace(/\D/g, '')}-${r.variantNumber || 'V1'}`, trialNumber: String(r.trialNumber), arNumber: args.ar, variantNumber: r.variantNumber || 'V1', variantDescription: r.variantDescription || null, recipeId: null, phTarget: r.phTarget ?? null, containsHydrolysates: null }])).values()];
const samples = []; const conds = new Set(); const tps = new Set();
rows.forEach((r) => { conds.add(r.conditionCode); tps.add(r.timePointCode); const v = variants.find((x) => x.trialNumber === String(r.trialNumber) && x.variantNumber === (r.variantNumber || 'V1')); const code = `SMP-${String(r.trialNumber).replace(/\D/g, '')}-${v.variantNumber}-${r.conditionCode}`; if (!samples.some((s) => s.sampleCode === code)) samples.push({ sampleCode: code, variantId: v.variantId, conditionCode: r.conditionCode, containerType: null, packageVolumeMl: null, fillHeightMm: null, bottleClarity: null, bottleBaseGeometry: null, packagingDescription: null, sourceFactory: null }); });
const TP_ORDER = ['T0', '1D', '1W', '2W', '1M', '2M', '3M', '4M', '6M', '9M', '12M', '15M', '18M'];
const plan = { planId: `PLN-${args.ar.replace(/\D/g, '')}-H`, planVersion: 1, arNumber: args.ar, intervalScheme: 'HISTORICAL', durationMonths: 12, planStatus: 'COMPLETE', conditions: [...conds].sort(), timePoints: [...tps].sort((a, b) => TP_ORDER.indexOf(a) - TP_ORDER.indexOf(b)), sourceSystem: 'SPREADSHEET', validFrom: args['valid-from'] || '2024-01-01' };
const fragment = { ars: [{ arNumber: args.ar, projectCode: args.project, arTitle: `Historical import ${args.sheet || args.csv || ''}`.trim(), arType: 'STABILITY_STUDY', requestedBy: null, plannedStart: null, forecastedDate: null, status: 'CLOSED' }], trials, variants, samples, plans: [plan] };

// ---- observation documents
// '0-1' style hedges take the higher value; anything outside 0 to 5 is treated as not evaluated
const rating = (v) => { if (v === null || v === undefined || v === '') return null; const s = String(v).trim(); if (s === '9999') return 'NA'; const nums = [...s.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0])).filter((n) => n <= 5); if (!nums.length) return 'NA'; return String(Math.min(5, Math.round(Math.max(...nums)))); };
const value = (fieldCode, domainCode, dataType, v, unit = null) => ({ fieldCode, domainCode, dataType, value: v, unit, isNA: false, naReason: null, mediaAssetId: null });
const naValue = (fieldCode, domainCode, dataType, reason) => ({ fieldCode, domainCode, dataType, value: null, unit: null, isNA: true, naReason: reason, mediaAssetId: null });
const ratingValue = (fieldCode, raw) => { const r = rating(raw); if (r === null) return null; return r === 'NA' ? naValue(fieldCode, fieldCode.startsWith('cream') ? 'CREAMING' : fieldCode.startsWith('serum') ? 'SERUM' : 'SEDIMENT', 'select', 'Not evaluated (historical 9999 placeholder)') : value(fieldCode, fieldCode.startsWith('cream') ? 'CREAMING' : fieldCode.startsWith('serum') ? 'SERUM' : 'SEDIMENT', 'select', r); };
const docs = rows.map((r) => {
  const v = variants.find((x) => x.trialNumber === String(r.trialNumber) && x.variantNumber === (r.variantNumber || 'V1'));
  const sample = samples.find((s) => s.variantId === v.variantId && s.conditionCode === r.conditionCode);
  const observedAt = r.observedDate ? new Date(r.observedDate).toISOString() : new Date(new Date(plan.validFrom).getTime() + ({ T0: 0, '1D': 1, '1W': 7, '2W': 14, '1M': 30, '2M': 61, '3M': 91, '4M': 122, '6M': 182, '9M': 273, '12M': 365, '15M': 456, '18M': 548 }[r.timePointCode] || 0) * 86400000).toISOString();
  const values = [value('shake_protocol', 'TEST_CONTEXT', 'select', 'SOP_10X_180'), value('exclude_from_trend', 'TEST_CONTEXT', 'boolean', false)];
  const push = (x) => { if (x) values.push(x); };
  const cu = rating(r.creamUnsh), su = rating(r.serumUnsh), sdu = rating(r.sedUnsh);
  if (cu !== null) values.push(value('cream_unsh_present', 'CREAMING', 'boolean', cu !== 'NA' && Number(cu) > 0));
  if (su !== null) values.push(value('serum_unsh_present', 'SERUM', 'boolean', su !== 'NA' && Number(su) > 0));
  if (sdu !== null) values.push(value('sed_unsh_present', 'SEDIMENT', 'boolean', sdu !== 'NA' && Number(sdu) > 0));
  push(ratingValue('cream_unsh_rating', r.creamUnsh)); push(ratingValue('serum_unsh_rating', r.serumUnsh)); push(ratingValue('sed_unsh_rating', r.sedUnsh));
  push(ratingValue('cream_sh_rating', r.creamSh)); push(ratingValue('serum_sh_rating', r.serumSh)); push(ratingValue('sed_sh_rating', r.sedSh));
  if (r.sedUnshMm !== null && r.sedUnshMm !== undefined) { values.push(value('sed_unsh_height_value', 'SEDIMENT', 'number', mmOf(r.sedUnshMm), 'mm'), value('sed_unsh_height_unit', 'SEDIMENT', 'select', 'MM')); }
  if (r.sedShMm !== null && r.sedShMm !== undefined) { values.push(value('sed_sh_height_value', 'SEDIMENT', 'number', mmOf(r.sedShMm), 'mm'), value('sed_sh_height_unit', 'SEDIMENT', 'select', 'MM')); }
  const ph = num(r.ph), visc = num(r.viscosity);
  values.push(value('lab_source', 'LAB_RESULTS', 'select', ph === null && visc === null ? 'NOT_AVAILABLE' : 'TYPED_FROM_LIMS'));
  if (ph !== null) values.push(value('lab_ph', 'LAB_RESULTS', 'number', ph, 'pH'));
  if (visc !== null) { values.push(value('lab_visc1_value', 'LAB_RESULTS', 'number', visc, 'mPa·s')); if (num(r.viscosityShearRate) !== null) values.push(value('lab_visc1_shear_rate', 'LAB_RESULTS', 'number', num(r.viscosityShearRate), '1/s')); if (num(r.viscosityTempC) !== null) values.push(value('lab_visc1_temp_c', 'LAB_RESULTS', 'number', num(r.viscosityTempC), '°C')); }
  if (r.comment) values.push(value('overall_comments', 'TEST_CONTEXT', 'longtext', String(r.comment)));
  const ratings = values.filter((x) => x.fieldCode.endsWith('_rating') && !x.isNA).map((x) => Number(x.value));
  const worst = ratings.length ? Math.max(...ratings) : null;
  return {
    schemaVersion: '1.0', observationId: randomUUID(), versionNo: 1, status: 'REVIEWED',
    context: { projectCode: args.project, arNumber: args.ar, trialNumber: String(r.trialNumber), variantId: v.variantId, variantNumber: v.variantNumber, sampleCode: sample.sampleCode, timePointCode: r.timePointCode, conditionCode: r.conditionCode, formulationClass: 'LIQUID_RTD', planId: plan.planId, planVersion: 1, sourceSystem: 'SPREADSHEET' },
    template: { templateId: 'TPL_RTD_QUICK', templateVersion: 1, templateName: 'RTD liquid: SOP rating sheet' },
    resultType: 'HISTORICAL_IMPORT', overallResult: worst === null ? null : worst >= 4 ? 'OUT' : worst >= 2 ? 'JUST_IN' : 'IN', overallResultNA: worst === null,
    observer: { userId: 'historical-import', displayName: 'Spreadsheet import', upn: 'import@local', role: 'ADMIN' }, observedAt, submittedAt: new Date().toISOString(),
    device: { userAgent: 'import_history.mjs', platform: 'node', online: true }, values, media: [],
    audit: { createdBy: 'historical-import', createdAt: new Date().toISOString(), correlationId: `hist-${args.ar}`, previousVersionUri: null },
  };
});

// ---- validate against the generated schema
const { default: Ajv } = await import('ajv/dist/2020.js'); const { default: addFormats } = await import('ajv-formats');
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(new URL('../src/data/observation.schema.json', import.meta.url))));
const invalid = docs.filter((d) => !validate(d) && (console.error(d.context.trialNumber, d.context.timePointCode, d.context.conditionCode, validate.errors.slice(0, 2)), true));
mkdirSync('history_out', { recursive: true });
writeFileSync('history_out/reference_fragment.json', JSON.stringify(fragment, null, 2));
writeFileSync('history_out/observations.json', JSON.stringify(docs, null, 2));
console.log(`${rows.length} rows -> ${docs.length} observations (${invalid.length} invalid), ${trials.length} trials, ${variants.length} variants, ${samples.length} samples. Written to history_out/.`);
if (!args.write) { console.log('Dry run. Load history_out/reference_fragment.json into the reference container, then rerun with --write.'); process.exit(invalid.length ? 1 : 0); }
const { observations } = await import('../src/services/store.js');
let ok = 0;
for (const d of docs) { try { await observations.submit(d, d.observer, { historical: true }); ok += 1; } catch (e) { console.error('failed', d.context.trialNumber, d.context.timePointCode, d.context.conditionCode, e.message, e.details || ''); } }
console.log(`submitted ${ok} of ${docs.length}`);
process.exit(0);
