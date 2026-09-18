#!/usr/bin/env node
// Load NESTMS / LIMS exports into the "reference" container. Runs anywhere with Azure credentials (DefaultAzureCredential):
// a scheduled job, a pipeline step, or a laptop. The API picks the new data up within a minute (60 s cache).
//
//   node import_reference.mjs --bundle exports/reference_bundle.json            # one JSON file with all entities
//   node import_reference.mjs --csv-dir exports/2026-08-31                     # projects.csv, ars.csv, trials.csv, variants.csv, samples.csv, plans.csv, users.csv
//   node import_reference.mjs --bundle b.json --dry-run                        # validate only
//
// Env: STORAGE_ACCOUNT_NAME (or STORAGE_CONNECTION_STRING), CONTAINER_REFERENCE (default: reference).
// plans.csv: conditions and timePoints are pipe-separated (e.g. "4C|25C|35C|45C", "T0|1M|3M|6M|9M|12M").
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [])).filter((x) => x.length));
const here = new URL('.', import.meta.url);
const schema = JSON.parse(readFileSync(new URL('../src/data/reference_bundle.schema.json', here)));
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const validate = ajv.compile(schema);
const FILES = { projects: 'projects', ars: 'ars', trials: 'trials', variants: 'variants', samples: 'samples', plans: 'plans', users: 'users' };

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const [h, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}
const num = (v) => (v === '' || v === undefined ? null : Number(v));
const bool = (v) => (v === '' || v === undefined ? null : /^(1|true|yes|y)$/i.test(v));
const blank = (v) => (v === '' || v === undefined ? null : v);
const coerce = {
  projects: (r) => ({ ...r, i2lCode: blank(r.i2lCode), consumerUsagePeriodHours: num(r.consumerUsagePeriodHours) }),
  ars: (r) => ({ ...r, arType: blank(r.arType), forecastedDate: blank(r.forecastedDate), plannedStart: blank(r.plannedStart), requestedBy: blank(r.requestedBy) }),
  trials: (r) => ({ ...r, processScale: blank(r.processScale), status: blank(r.status), terminationReason: blank(r.terminationReason), productFormat: blank(r.productFormat), trialDescription: blank(r.trialDescription) }),
  variants: (r) => ({ ...r, phTarget: num(r.phTarget), containsHydrolysates: bool(r.containsHydrolysates), recipeId: blank(r.recipeId), variantDescription: blank(r.variantDescription) }),
  samples: (r) => ({ ...r, packageVolumeMl: num(r.packageVolumeMl), fillHeightMm: num(r.fillHeightMm), bottleClarity: blank(r.bottleClarity), bottleBaseGeometry: blank(r.bottleBaseGeometry), packagingDescription: blank(r.packagingDescription), sourceFactory: blank(r.sourceFactory), containerType: blank(r.containerType) }),
  plans: (r) => ({ ...r, planVersion: Number(r.planVersion || 1), durationMonths: Number(r.durationMonths), conditions: String(r.conditions).split('|').filter(Boolean), timePoints: String(r.timePoints).split('|').filter(Boolean), sourceSystem: blank(r.sourceSystem) }),
};

let bundle;
if (args.bundle) bundle = JSON.parse(readFileSync(args.bundle, 'utf8'));
else if (args['csv-dir']) {
  bundle = { source: `CSV export ${args['csv-dir']}`, exportedAt: new Date().toISOString() };
  for (const [entity, file] of Object.entries(FILES)) {
    const p = join(args['csv-dir'], `${file}.csv`);
    if (existsSync(p)) bundle[entity] = parseCsv(readFileSync(p, 'utf8')).map((r) => (coerce[entity] ? coerce[entity](r) : r));
  }
} else { console.error('Usage: import_reference.mjs --bundle file.json | --csv-dir folder [--dry-run]'); process.exit(2); }

if (!validate(bundle)) { console.error('Bundle failed schema validation:'); validate.errors.slice(0, 30).forEach((e) => console.error(` ${e.instancePath || '/'} ${e.message}`)); process.exit(1); }
const counts = Object.fromEntries(Object.keys(FILES).map((e) => [e, (bundle[e] || []).length]));
console.log('Bundle valid:', counts);
if (args['dry-run']) process.exit(0);

const { BlobServiceClient } = await import('@azure/storage-blob');
let svc;
if (process.env.STORAGE_CONNECTION_STRING) svc = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING);
else { const { DefaultAzureCredential } = await import('@azure/identity'); svc = new BlobServiceClient(`https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, new DefaultAzureCredential()); }
const container = svc.getContainerClient(process.env.CONTAINER_REFERENCE || 'reference');
await container.createIfNotExists();
const put = async (name, doc, metadata = {}) => { const body = JSON.stringify(doc); await container.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: 'application/json' }, metadata }); };
for (const [entity, file] of Object.entries(FILES)) await put(`${file}.json`, bundle[entity] || [], { entity, count: String(counts[entity]) });
const manifest = { source: bundle.source || 'CLI_IMPORT', updatedAt: new Date().toISOString(), updatedBy: process.env.USER || 'import_reference.mjs', exportedAt: bundle.exportedAt || null, entities: Object.fromEntries(Object.entries(FILES).map(([e, f]) => [e, { count: counts[e], blob: `${container.containerName}/${f}.json` }])) };
await put('_manifest.json', manifest);
console.log('Imported to', container.url, '\n', manifest);
