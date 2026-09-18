// End-to-end smoke test in LOCAL_MODE: reference cascade -> SAS grant -> "upload" -> submit -> review -> audit -> export. Also proves the rejections.
import assert from 'node:assert/strict';
process.env.LOCAL_MODE = 'true'; process.env.PORT = '18080';
const { default: app } = await import('../src/server.js');
const base = `http://localhost:18080`;
const j = async (path, { method = 'GET', body, user = 'scientist', raw } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-demo-user': user }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
await new Promise((r) => setTimeout(r, 300));
let r = await j('/api/health'); assert.equal(r.status, 200);
r = await j('/api/catalog'); assert.equal(r.status, 200); assert.equal(r.data.coreFieldCount + r.data.sopFieldCount + r.data.extensionFieldCount, r.data.fields.length); console.log('catalog ok:', r.data.fields.length, 'fields (', r.data.coreFieldCount, 'URS,', r.data.sopFieldCount, 'SOP,', r.data.extensionFieldCount, 'ext ),', r.data.templates.length, 'templates');
const projects = (await j('/api/reference/projects')).data; const ars = (await j(`/api/reference/ars?projectCode=${projects[0].projectCode}`)).data;
const trials = (await j(`/api/reference/trials?arNumber=${ars[0].arNumber}`)).data; const variants = (await j(`/api/reference/variants?arNumber=${ars[0].arNumber}&trialNumber=${trials[0].trialNumber}`)).data;
const samples = (await j(`/api/reference/samples?variantId=${variants[0].variantId}`)).data; const plan = (await j(`/api/reference/plan?arNumber=${ars[0].arNumber}`)).data;
console.log('reference cascade ok:', projects.length, 'projects ->', samples.length, 'samples, plan', plan.planId);
const list0 = (await j('/api/observations')).data; console.log('seeded observations:', list0.length);

const sample = samples[0]; const ctx = { projectCode: projects[0].projectCode, arNumber: ars[0].arNumber, trialNumber: trials[0].trialNumber, variantId: variants[0].variantId, variantNumber: variants[0].variantNumber, sampleCode: sample.sampleCode, timePointCode: '9M', conditionCode: sample.conditionCode, formulationClass: 'LIQUID_RTD', planId: plan.planId, planVersion: plan.planVersion, sourceSystem: 'REFERENCE_STORE' };
const { standardFilename, mediaBlobPath } = await import('../src/services/naming.js');
const fname = standardFilename({ ...ctx, domainCode: 'GENERAL_MEDIA', fieldCode: 'general_overview_photo', capturedAt: new Date(), seq: 1, contentType: 'image/jpeg' });
const bpath = mediaBlobPath(ctx, fname);
const fname2 = standardFilename({ ...ctx, domainCode: 'GENERAL_MEDIA', fieldCode: 'general_empty_bottle_photo', capturedAt: new Date(), seq: 1, contentType: 'image/jpeg' });
const bpath2 = mediaBlobPath(ctx, fname2);
const obsId = '9c1f2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
r = await j('/api/media/upload-urls', { method: 'POST', body: { observationId: obsId, media: [{ mediaAssetId: 'MED-TEST0001', blobPath: bpath, contentType: 'image/jpeg' }, { mediaAssetId: 'MED-TEST0002', blobPath: bpath2, contentType: 'image/jpeg' }] } });
assert.equal(r.status, 200); console.log('SAS grant ok:', r.data[0].uploadUrl.slice(0, 60));
assert.equal(standardFilename({ projectCode: 'PRJ-2026-014', arNumber: 'AR-33440', trialNumber: '33440.008', variantNumber: 'V1', timePointCode: '1M', conditionCode: '25C', domainCode: 'SEDIMENT', fieldCode: 'sed_unsh_photo', capturedAt: new Date('2026-09-01T10:00:00'), seq: 1, contentType: 'image/jpeg' }).split('_')[2], '33440-008'); console.log('dotted trial code keeps its structure in the filename ok');
const bad = await j('/api/media/upload-urls', { method: 'POST', body: { observationId: obsId, media: [{ mediaAssetId: 'x', blobPath: 'PRJ/AR/T01/IMG_4412.JPG', contentType: 'image/jpeg' }] } }); assert.equal(bad.status, 400); console.log('non-standard filename rejected ok');
const doc = { schemaVersion: '1.0', observationId: obsId, versionNo: 1, status: 'SUBMITTED', context: ctx, template: { templateId: 'TPL_RTD_MVP', templateVersion: 1, templateName: 'RTD liquid: MVP guided questionnaire' }, resultType: 'SCHEDULED', overallResult: 'JUST_IN', overallResultNA: false,
  observer: { userId: 'spoof', displayName: 'Spoof', upn: 'spoof@x', role: 'ADMIN' }, observedAt: new Date().toISOString(), submittedAt: null, device: { userAgent: 'test', platform: 'node', online: true },
  values: [ { fieldCode: 'general_overview_photo', domainCode: 'GENERAL_MEDIA', dataType: 'media_photo', value: ['MED-TEST0001'], unit: null, isNA: false, naReason: null, mediaAssetId: 'MED-TEST0001' },
    { fieldCode: 'general_empty_bottle_photo', domainCode: 'GENERAL_MEDIA', dataType: 'media_photo', value: ['MED-TEST0002'], unit: null, isNA: false, naReason: null, mediaAssetId: 'MED-TEST0002' },
    { fieldCode: 'homog_unshaken_homogeneous', domainCode: 'HOMOG', dataType: 'boolean', value: false, unit: null, isNA: false, naReason: null, mediaAssetId: null },
    { fieldCode: 'cream_unsh_present', domainCode: 'CREAMING', dataType: 'boolean', value: true, unit: null, isNA: false, naReason: null, mediaAssetId: null },
    { fieldCode: 'cream_unsh_layer_thickness_value', domainCode: 'CREAMING', dataType: 'number', value: null, unit: 'mm', isNA: true, naReason: 'Test not performed at this pull', mediaAssetId: null },
    { fieldCode: 'cream_unsh_rating', domainCode: 'CREAMING', dataType: 'select', value: '3', unit: null, isNA: false, naReason: null, mediaAssetId: null },
    { fieldCode: 'shake_protocol', domainCode: 'TEST_CONTEXT', dataType: 'select', value: 'SOP_10X_180', unit: null, isNA: false, naReason: null, mediaAssetId: null } ],
  media: [{ mediaAssetId: 'MED-TEST0001', fieldCode: 'general_overview_photo', mediaType: 'PHOTO', blobContainer: 'media', blobPath: bpath, blobUri: 'x', standardFilename: fname, originalFilename: 'IMG_4412.JPG', contentType: 'image/jpeg', sizeBytes: 100, widthPx: 10, heightPx: 10, durationS: null, capturedAt: new Date().toISOString(), deviceModel: 'test', checksumSha256: null },
    { mediaAssetId: 'MED-TEST0002', fieldCode: 'general_empty_bottle_photo', mediaType: 'PHOTO', blobContainer: 'media', blobPath: bpath2, blobUri: 'x', standardFilename: fname2, originalFilename: 'IMG_4413.JPG', contentType: 'image/jpeg', sizeBytes: 100, widthPx: 10, heightPx: 10, durationS: null, capturedAt: new Date().toISOString(), deviceModel: 'test', checksumSha256: null }],
  audit: { createdBy: 'x', createdAt: new Date().toISOString(), correlationId: 'corr-test', previousVersionUri: null } };
r = await j('/api/observations', { method: 'POST', body: doc }); assert.equal(r.status, 409, JSON.stringify(r.data)); console.log('submit before media upload rejected ok (409):', r.data.error.slice(0, 60));
r = await fetch(`${base}/local-upload/${encodeURIComponent(bpath)}`, { method: 'PUT', body: Buffer.from('jpegbytes') }); assert.equal(r.status, 201);
r = await fetch(`${base}/local-upload/${encodeURIComponent(bpath2)}`, { method: 'PUT', body: Buffer.from('jpegbytes') }); assert.equal(r.status, 201);
r = await j('/api/observations', { method: 'POST', body: doc }); assert.equal(r.status, 201, JSON.stringify(r.data)); console.log('submit ok:', r.data.blobPath, 'v' + r.data.versionNo);
r = await j(`/api/observations/${obsId}`); assert.equal(r.data.observer.displayName, 'P. Raman'); assert.equal(r.data.status, 'SUBMITTED'); console.log('server-side identity enforced ok (client claimed Spoof/ADMIN)');
const nine = { ...doc, values: [...doc.values, { fieldCode: 'serum_unsh_pct_package_volume', domainCode: 'SERUM', dataType: 'percent', value: 9999, unit: '%', isNA: false, naReason: null, mediaAssetId: null }] };
r = await j('/api/observations', { method: 'POST', body: nine }); assert.equal(r.status, 400); console.log('9999 placeholder rejected ok:', r.data.details);
r = await j('/api/observations', { method: 'POST', body: { ...doc, context: { ...ctx, conditionCode: '55C' } } }); assert.equal(r.status, 400); console.log('bad context rejected ok');
r = await j('/api/observations', { method: 'POST', body: { ...doc, values: [...doc.values, { fieldCode: 'cream_unsh_layer_thickness_value', domainCode: 'CREAMING', dataType: 'number', value: 2.5, unit: 'mm', isNA: false, naReason: null, mediaAssetId: null }] } }); assert.equal(r.status, 201); assert.equal(r.data.versionNo, 2); console.log('amendment created version 2 ok');
r = await j(`/api/observations/${obsId}/review`, { method: 'POST', body: { action: 'REVIEW' }, user: 'scientist' }); assert.equal(r.status, 403); console.log('scientist cannot review ok (403)');
r = await j(`/api/observations/${obsId}/review`, { method: 'POST', body: { action: 'REVIEW' }, user: 'reviewer' }); assert.equal(r.status, 200); assert.equal(r.data.status, 'REVIEWED'); console.log('reviewer review ok');
r = await j('/api/templates', { method: 'POST', body: { templateId: 'TPL_TEST', templateName: 'Test', formulationClass: 'LIQUID_RTD', status: 'ACTIVE', description: '', sections: [{ label: 'A', fields: ['general_overview_photo', 'cream_unsh_present'] }], requiredOverrides: {} }, user: 'reviewer' }); assert.equal(r.status, 201); assert.equal(r.data.version, 1);
r = await j('/api/templates', { method: 'POST', body: { templateId: 'TPL_TEST', templateName: 'Test', formulationClass: 'LIQUID_RTD', status: 'ACTIVE', description: '', sections: [{ label: 'A', fields: ['bogus_field'] }], requiredOverrides: {} }, user: 'reviewer' }); assert.equal(r.status, 400); console.log('template with unknown field rejected ok');
r = await j('/api/catalog/vocabularies/COLOR_DESC/values', { method: 'POST', body: { code: 'MAUVE', label: 'Mauve' }, user: 'admin' }); assert.equal(r.status, 200); console.log('admin added vocabulary value ok');
r = await j('/api/catalog/vocabularies/COLOR_DESC/values', { method: 'POST', body: { code: 'MAUVE2', label: 'Mauve' }, user: 'scientist' }); assert.equal(r.status, 403);
// reference data: status, import (admin only), schema + integrity rejections
r = await j('/api/reference/status'); assert.equal(r.status, 200); assert.equal(r.data.source, 'DEMO_SEED'); console.log('reference status ok:', r.data.entities.samples.count, 'samples, source', r.data.source); assert.equal(r.data.entities.labResults, undefined);
const { demoBundle } = await import('../src/services/reference.js');
const bundle = { ...demoBundle(), source: 'NESTMS weekly export', exportedAt: new Date().toISOString() };
r = await j('/api/reference/import', { method: 'POST', body: bundle, user: 'scientist' }); assert.equal(r.status, 403); console.log('scientist cannot import reference ok (403)');
r = await j('/api/reference/import', { method: 'POST', body: { ...bundle, samples: [...bundle.samples, { sampleCode: 'SMP-BAD', variantId: 'VAR-9999', conditionCode: '25C' }] }, user: 'admin' }); assert.equal(r.status, 400); console.log('orphan sample rejected ok:', r.data.details[0]);
r = await j('/api/reference/import', { method: 'POST', body: { ...bundle, samples: [...bundle.samples, { sampleCode: 'SMP-BAD2', variantId: bundle.variants[0].variantId, conditionCode: '99C' }] }, user: 'admin' }); assert.equal(r.status, 400); console.log('unknown condition code rejected by schema ok');
r = await j('/api/reference/import', { method: 'POST', body: { ...bundle, samples: [...bundle.samples.slice(1), { ...bundle.samples[0], bottleBaseGeometry: 'DOMED' }] }, user: 'admin' }); assert.equal(r.status, 400); console.log('unknown bottle geometry rejected by schema ok');
r = await j('/api/reference/import', { method: 'POST', body: bundle, user: 'admin' }); assert.equal(r.status, 201); assert.equal(r.data.source, 'ADMIN_UPLOAD'); console.log('admin reference import ok:', Object.entries(r.data.entities).map(([k, v]) => `${k}=${v.count}`).join(' '));
r = await j('/api/reference/status'); assert.equal(r.data.source, 'ADMIN_UPLOAD');
r = await j('/api/audit?limit=8', { user: 'reviewer' }); assert.equal(r.status, 200); console.log('audit trail:', r.data.slice(0, 5).map((a) => `${a.action}:${a.entityType}`).join(', '));
r = await j('/api/observations/export.csv?arNumber=' + ars[0].arNumber, { user: 'reviewer' }); assert.equal(r.status, 200); console.log('csv export rows:', r.data.split('\n').length - 1);
console.log('\nALL API SMOKE TESTS PASSED');
process.exit(0);
