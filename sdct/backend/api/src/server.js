import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { authenticate, requirePermission } from './middleware/auth.js';
import { reference } from './services/reference.js';
import { observations, configStore, audit, FILENAME_RE } from './services/store.js';
import { blob } from './services/blob.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.allowedOrigins.length ? config.allowedOrigins : true, credentials: false }));
app.use(express.json({ limit: '4mb' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get('/api/health', (req, res) => res.json({ ok: true, mode: config.localMode ? 'local' : 'azure', time: new Date().toISOString() }));

const api = express.Router();
api.use(authenticate);

// ---- catalog and configuration (R-13, R-14, R-38)
api.get('/catalog', wrap(async (req, res) => res.json(await configStore.catalog())));
api.post('/catalog/vocabularies/:code/values', requirePermission('admin'), wrap(async (req, res) => {
  const vocabs = await configStore.vocabularies(); const v = vocabs.find((x) => x.code === req.params.code);
  if (!v) return res.status(404).json({ error: 'Vocabulary not found' });
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_'); const label = String(req.body.label || '').trim();
  if (!code || !label) return res.status(400).json({ error: 'code and label are required' });
  if (v.values.some((x) => x.code === code)) return res.status(409).json({ error: `Value ${code} already exists` });
  v.values.push({ code, label, sortOrder: v.values.length + 1, isActive: true });
  await configStore.saveVocabularies(vocabs, req.user, `${v.code}.${code}`);
  res.json(v);
}));
api.post('/catalog/vocabularies/:code/values/:value/toggle', requirePermission('admin'), wrap(async (req, res) => {
  const vocabs = await configStore.vocabularies(); const v = vocabs.find((x) => x.code === req.params.code); const item = v?.values.find((x) => x.code === req.params.value);
  if (!item) return res.status(404).json({ error: 'Value not found' });
  item.isActive = !item.isActive; await configStore.saveVocabularies(vocabs, req.user, `${v.code}.${item.code}`); res.json(v);
}));

// ---- reference data, read-only from the reference container (NESTMS / LIMS exports) (R-03, R-15, R-21)
api.get('/reference/projects', wrap(async (req, res) => res.json(await reference.projects())));
api.get('/reference/ars', wrap(async (req, res) => res.json(await reference.ars(req.query.projectCode))));
api.get('/reference/trials', wrap(async (req, res) => res.json(await reference.trials(req.query.arNumber))));
api.get('/reference/variants', wrap(async (req, res) => res.json(await reference.variants(req.query.arNumber, req.query.trialNumber))));
api.get('/reference/samples', wrap(async (req, res) => res.json(await reference.samples(req.query.variantId))));
api.get('/reference/plan', wrap(async (req, res) => res.json(await reference.plan(req.query.arNumber))));
api.get('/reference/users', wrap(async (req, res) => res.json(await reference.users())));
api.get('/reference/status', wrap(async (req, res) => res.json(await reference.status())));
// Admin import of a reference bundle (projects, ARs, trials, variants, samples, plans, users). Validated against reference_bundle.schema.json.
api.post('/reference/import', requirePermission('admin'), express.json({ limit: '64mb' }), wrap(async (req, res) => {
  const manifest = await reference.importBundle(req.body, req.user, req.query.source || 'ADMIN_UPLOAD');
  await audit.log({ actor: req.user, action: 'CONFIG_CHANGE', entityType: 'REFERENCE', entityId: 'reference-bundle', detail: Object.entries(manifest.entities).map(([k, v]) => `${k}=${v.count}`).join(', ') });
  res.status(201).json(manifest);
}));

// ---- templates (R-38, transcript template builder)
api.get('/templates', wrap(async (req, res) => res.json(await configStore.templates())));
api.post('/templates', requirePermission('templates'), wrap(async (req, res) => res.status(201).json(await configStore.saveTemplate(req.body, req.user))));

// ---- media: write-only SAS for the exact convention path (R-17, R-22)
api.post('/media/upload-urls', requirePermission('capture'), wrap(async (req, res) => {
  const items = Array.isArray(req.body.media) ? req.body.media : [];
  if (!items.length || items.length > 12) return res.status(400).json({ error: 'Provide 1 to 12 media items' });
  res.json(await observations.uploadGrants(req.body.observationId, items));
}));

// ---- observations (R-18, R-23, R-27, R-28, R-35)
api.get('/observations', wrap(async (req, res) => res.json(await observations.list(req.query))));
api.get('/observations/export.csv', requirePermission('export'), wrap(async (req, res) => {
  const list = await observations.list(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="stability_observations_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(observations.toCsv(list));
}));
api.get('/observations/:id', wrap(async (req, res) => { const o = await observations.get(req.params.id); if (!o) return res.status(404).json({ error: 'Not found' }); res.json(o); }));
api.post('/observations', requirePermission('capture'), wrap(async (req, res) => res.status(201).json(await observations.submit(req.body, req.user))));
api.post('/observations/:id/review', requirePermission('review'), wrap(async (req, res) => res.json(await observations.review(req.params.id, req.body.action === 'REJECT' ? 'REJECT' : 'REVIEW', req.user, req.body.note))));

// ---- audit trail (R-31, R-32)
api.get('/audit', requirePermission('view'), wrap(async (req, res) => res.json(await audit.recent(Math.min(Number(req.query.limit) || 100, 1000)))));

app.use('/api', api);

// LOCAL_MODE stand-in for the Blob SAS upload target so the whole flow can run on a laptop
if (config.localMode) {
  app.put('/local-upload/:path', express.raw({ type: '*/*', limit: '200mb' }), wrap(async (req, res) => {
    const path = decodeURIComponent(req.params.path);
    if (!FILENAME_RE.test(path.split('/').pop())) return res.status(400).json({ error: 'Filename does not follow the naming convention' });
    await blob._localPutMedia(path); res.status(201).end();
  }));
}

// Serve the built React app from the same Web App when STATIC_DIR is set
if (config.staticDir) {
  const dir = resolve(config.staticDir);
  if (existsSync(dir)) { app.use(express.static(dir)); app.get('*', (req, res) => res.sendFile(resolve(dir, 'index.html'))); }
}

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, details: err.details });
});

if (process.env.NODE_ENV !== 'test') app.listen(config.port, () => console.log(`Stability Capture API listening on :${config.port} (${config.localMode ? 'LOCAL_MODE, in-memory' : 'Azure'})`));
export default app;
