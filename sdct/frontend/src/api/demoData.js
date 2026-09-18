import catalog from '../data/catalog.json';
import { standardFilename, mediaBlobPath } from '../lib/naming.js';
import { suggestAll } from '../lib/ratings.js';

// Seeded PRNG so every reload shows the same data (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(20260901);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export const users = [
  { userId: 'u-ingalls', displayName: 'N. Ingalls', upn: 'n.ingalls@example.com', role: 'ADMIN', title: 'PD Lead' },
  { userId: 'u-oka', displayName: 'D. Oka', upn: 'd.oka@example.com', role: 'REVIEWER', title: 'Digital Team Lead' },
  { userId: 'u-praveen', displayName: 'P. Raman', upn: 'p.raman@example.com', role: 'SCIENTIST', title: 'Product Specialist' },
  { userId: 'u-chen', displayName: 'L. Chen', upn: 'l.chen@example.com', role: 'SCIENTIST', title: 'Product Specialist' },
];

// ---------------------------------------------------------------- reference data (what the NESTMS export carries)
export const projects = [
  { projectCode: 'PRJ-2026-014', projectName: 'High-protein RTD shake, vanilla reformulation', businessUnit: 'Active Nutrition', i2lCode: 'I2L-88214', consumerUsagePeriodHours: null, status: 'ACTIVE', formulationClass: 'LIQUID_RTD' },
  { projectCode: 'PRJ-2026-021', projectName: 'Peptide-based enteral formula 1.5 kcal', businessUnit: 'Medical Nutrition', i2lCode: 'I2L-88377', consumerUsagePeriodHours: 24, status: 'ACTIVE', formulationClass: 'LIQUID_RTD' },
  { projectCode: 'PRJ-2026-033', projectName: 'Whey isolate powder, chocolate', businessUnit: 'Active Nutrition', i2lCode: 'I2L-88402', consumerUsagePeriodHours: null, status: 'ACTIVE', formulationClass: 'POWDER' },
  { projectCode: 'PRJ-2026-041', projectName: 'Multivitamin gummy, adult', businessUnit: 'VMS', i2lCode: 'I2L-88455', consumerUsagePeriodHours: null, status: 'ACTIVE', formulationClass: 'VMS' },
];

export const ars = [
  { arNumber: 'AR-10421', projectCode: 'PRJ-2026-014', arTitle: 'Shelf-life confirmation, 12 months, 4 conditions', arType: 'STABILITY_STUDY', requestedBy: 'N. Ingalls', plannedStart: '2026-02-16', forecastedDate: '2027-05-16', status: 'ACTIVE' },
  { arNumber: 'AR-10488', projectCode: 'PRJ-2026-014', arTitle: 'Accelerated screen, new emulsifier system', arType: 'STABILITY_STUDY', requestedBy: 'N. Ingalls', plannedStart: '2026-06-01', forecastedDate: '2026-12-15', status: 'ACTIVE' },
  { arNumber: 'AR-10502', projectCode: 'PRJ-2026-021', arTitle: 'Serum separation investigation, bi-weekly pulls', arType: 'STABILITY_STUDY', requestedBy: 'L. Chen', plannedStart: '2026-05-04', forecastedDate: '2026-09-30', status: 'ACTIVE' },
  { arNumber: 'AR-10530', projectCode: 'PRJ-2026-033', arTitle: 'Powder caking and dissolution, 25/35/45', arType: 'STABILITY_STUDY', requestedBy: 'P. Raman', plannedStart: '2026-07-06', forecastedDate: '2027-08-06', status: 'ACTIVE' },
  { arNumber: 'AR-10547', projectCode: 'PRJ-2026-041', arTitle: 'Gummy stability, 18 months', arType: 'STABILITY_STUDY', requestedBy: 'D. Oka', plannedStart: '2026-03-02', forecastedDate: '2027-10-01', status: 'ACTIVE' },
];

export const trials = [
  { trialNumber: '10421.001', arNumber: 'AR-10421', trialDescription: 'Baseline vs 2 stabiliser levels', formulationClass: 'LIQUID_RTD', productFormat: 'BOTTLE_PET', processScale: 'PILOT_PLANT', status: 'ACTIVE', terminationReason: null },
  { trialNumber: '10421.002', arNumber: 'AR-10421', trialDescription: 'Homogenisation pressure 250 vs 350 bar', formulationClass: 'LIQUID_RTD', productFormat: 'BOTTLE_PET', processScale: 'PILOT_PLANT', status: 'ACTIVE', terminationReason: null },
  { trialNumber: '10488.001', arNumber: 'AR-10488', trialDescription: 'Emulsifier A vs B, single level', formulationClass: 'LIQUID_RTD', productFormat: 'CAN', processScale: 'MICROTHERMICS', status: 'ACTIVE', terminationReason: null },
  { trialNumber: '10502.001', arNumber: 'AR-10502', trialDescription: 'Hydrocolloid ladder 0.05 to 0.20%', formulationClass: 'LIQUID_RTD', productFormat: 'TETRA', processScale: 'PILOT_PLANT', status: 'ACTIVE', terminationReason: null },
  { trialNumber: '10530.001', arNumber: 'AR-10530', trialDescription: 'Anti-caking agent 0 vs 0.5%', formulationClass: 'POWDER', productFormat: 'TUB', processScale: 'PILOT_PLANT', status: 'ACTIVE', terminationReason: null },
  { trialNumber: '10547.001', arNumber: 'AR-10547', trialDescription: 'Pectin vs gelatin base', formulationClass: 'VMS', productFormat: 'JAR', processScale: 'INDUSTRIAL_TRIAL', status: 'ACTIVE', terminationReason: null },
];

export const variants = [];
export const samples = [];
let vseq = 1;
trials.forEach((t) => {
  const n = t.trialNumber === '10421.001' ? 3 : 2;
  for (let i = 1; i <= n; i += 1) {
    const variantId = `VAR-${String(vseq).padStart(4, '0')}`; vseq += 1;
    variants.push({ variantId, trialNumber: t.trialNumber, arNumber: t.arNumber, variantNumber: `V${i}`, variantDescription: `${t.trialDescription.split(' vs ')[0]} variant ${i}`, recipeId: `RCP-${8800 + vseq}`, phTarget: t.formulationClass === 'LIQUID_RTD' ? 6.8 : null, containsHydrolysates: t.arNumber === 'AR-10502' });
    ['4C', '25C', '35C', '45C'].forEach((cond) => {
      const rtd = t.formulationClass === 'LIQUID_RTD';
      const boost = t.productFormat === 'BOTTLE_PET';
      samples.push({ sampleCode: `SMP-${t.arNumber.slice(3)}-${t.trialNumber.split('.')[1]}-V${i}-${cond}`, variantId, conditionCode: cond,
        containerType: t.productFormat === 'CAN' ? 'METAL' : t.productFormat === 'TETRA' ? 'LAMINATE' : boost ? 'CLEAR_PLASTIC' : 'OPAQUE_PLASTIC',
        packageVolumeMl: rtd ? (boost ? 237 : t.productFormat === 'CAN' ? 250 : 200) : null, fillHeightMm: rtd ? (boost ? 148 : 140) : null,
        bottleClarity: rtd ? (boost ? 'CLEAR' : 'OPAQUE') : null, bottleBaseGeometry: rtd ? (boost ? 'RAISED_CENTER' : 'FLAT') : null,
        packagingDescription: boost ? '237 mL clear BOOST bottle' : t.productFormat === 'CAN' ? '250 mL aluminium can' : t.productFormat === 'TETRA' ? '200 mL aseptic carton' : null,
        sourceFactory: boost ? 'Anderson' : t.productFormat === 'TETRA' ? 'Biessenhofen' : null });
    });
  }
});

const std = ['T0', '1M', '3M', '6M', '9M', '12M'];
export const plans = [
  { planId: 'PLN-10421-1', planVersion: 2, arNumber: 'AR-10421', intervalScheme: 'STANDARD_1_3_6_9_12', durationMonths: 12, planStatus: 'ACTIVE', conditions: ['4C', '25C', '35C', '45C'], timePoints: std, sourceSystem: 'NESTMS', validFrom: '2026-02-16' },
  { planId: 'PLN-10488-1', planVersion: 1, arNumber: 'AR-10488', intervalScheme: 'STANDARD_1_3_6_9_12', durationMonths: 6, planStatus: 'ACTIVE', conditions: ['25C', '35C', '45C'], timePoints: ['T0', '1W', '1M', '3M', '6M'], sourceSystem: 'NESTMS', validFrom: '2026-06-01' },
  { planId: 'PLN-10502-1', planVersion: 1, arNumber: 'AR-10502', intervalScheme: 'BIWEEKLY', durationMonths: 3, planStatus: 'ACTIVE', conditions: ['4C', '25C', '35C'], timePoints: ['T0', '2W', '1M', '2M', '3M'], sourceSystem: 'NESTMS', validFrom: '2026-05-04' },
  { planId: 'PLN-10530-1', planVersion: 1, arNumber: 'AR-10530', intervalScheme: 'STANDARD_1_3_6_9_12', durationMonths: 12, planStatus: 'ACTIVE', conditions: ['25C', '35C', '45C'], timePoints: std, sourceSystem: 'NESTMS', validFrom: '2026-07-06' },
  { planId: 'PLN-10547-1', planVersion: 1, arNumber: 'AR-10547', intervalScheme: 'STANDARD_1_3_6_9_12', durationMonths: 18, planStatus: 'ACTIVE', conditions: ['25C', '35C', '45C'], timePoints: [...std, '15M', '18M'], sourceSystem: 'NESTMS', validFrom: '2026-03-02' },
];

export const TP_DAYS = { T0: 0, '1D': 1, '1W': 7, '2W': 14, '1M': 30, '2M': 61, '3M': 91, '4M': 122, '6M': 182, '9M': 273, '12M': 365, '15M': 456, '18M': 548 };
export function dueDate(plan, tp) { const d = new Date(plan.validFrom); d.setDate(d.getDate() + TP_DAYS[tp]); return d.toISOString().slice(0, 10); }

// ---------------------------------------------------------------- seeded observations
const fieldIndex = Object.fromEntries(catalog.fields.map((f) => [f.fieldCode, f]));
const templateById = Object.fromEntries(catalog.templates.map((t) => [t.templateId, t]));
const TODAY = new Date('2026-09-01');

function val(fieldCode, value, extra = {}) {
  const f = fieldIndex[fieldCode];
  if (!f) throw new Error(`demo seed references unknown field ${fieldCode}`);
  return { fieldCode, domainCode: f.domainCode, dataType: f.dataType, value, unit: f.unit || null, isNA: false, naReason: null, mediaAssetId: null, ...extra };
}
function na(fieldCode, reason) { return { ...val(fieldCode, null), isNA: true, naReason: reason }; }

export const observations = [];
export const auditLog = [];
let mseq = 1;

function mediaFor(ctx, fieldCode, capturedAt, kind = 'PHOTO') {
  const id = `MED-${String(mseq).padStart(5, '0')}`; mseq += 1;
  const f = fieldIndex[fieldCode];
  const contentType = kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg';
  const fname = standardFilename({ ...ctx, domainCode: f.domainCode, fieldCode, capturedAt, seq: 1, contentType });
  return { mediaAssetId: id, fieldCode, mediaType: kind, blobContainer: 'media', blobPath: mediaBlobPath(ctx, fname), blobUri: `https://stsdctdev.blob.core.windows.net/media/${mediaBlobPath(ctx, fname)}`, standardFilename: fname, originalFilename: kind === 'VIDEO' ? 'IMG_4412.MOV' : `IMG_${4000 + mseq}.JPG`, contentType, sizeBytes: kind === 'VIDEO' ? 18_400_000 + Math.floor(rand() * 4_000_000) : 2_100_000 + Math.floor(rand() * 900_000), widthPx: 3024, heightPx: 4032, durationS: kind === 'VIDEO' ? round(12 + rand() * 8, 1) : null, capturedAt, deviceModel: 'iPad (10th gen)', checksumSha256: null };
}

// Typed-in lab results (no LIMS integration). The team sheets only have pH / viscosity at the ambient pull.
function labValues(cond, ti, temp, variantIndex) {
  if (cond !== '25C') return [val('lab_source', 'NOT_AVAILABLE')];
  const ph = round(6.85 - ti * 0.03 + (rand() - 0.5) * 0.04, 2);
  const v20 = round(52 + ti * 60 * (1 + variantIndex * 0.15) + (rand() - 0.5) * 12, 1);
  return [val('lab_source', 'TYPED_FROM_LIMS'), val('lab_lims_reference', `LIMS-26-${String(48000 + Math.floor(rand() * 9000))}`), val('lab_ph', ph),
    val('lab_visc1_value', v20), val('lab_visc1_instrument', 'PHYSICA_RHEOMETER'), val('lab_visc1_geometry', 'CC27'), val('lab_visc1_shear_rate', 100), val('lab_visc1_temp_c', 20),
    val('lab_visc2_value', round(v20 * 2.1, 1)), val('lab_visc2_instrument', 'PHYSICA_RHEOMETER'), val('lab_visc2_geometry', 'CC27'), val('lab_visc2_shear_rate', 100), val('lab_visc2_temp_c', 4),
    val('lab_measured_at', new Date(TODAY.getTime() - (200 - ti * 30) * 86400000).toISOString())];
}

// Apply SOP-derived ratings to a values array exactly the way the capture screen would
function withRatings(values, sample) {
  const entries = Object.fromEntries(values.map((v) => [v.fieldCode, { value: v.value, isNA: v.isNA }]));
  const sug = suggestAll(entries, sample);
  Object.entries(sug).forEach(([code, s]) => { if (!values.some((v) => v.fieldCode === code)) values.push(val(code, s.rating)); });
  return values;
}
const maxRating = (values) => Math.max(0, ...values.filter((v) => v.fieldCode.endsWith('_rating') && !v.isNA).map((v) => Number(v.value)));
const resultFrom = (values, gelled) => (gelled ? 'OUT' : maxRating(values) >= 4 ? 'OUT' : maxRating(values) >= 2 ? 'JUST_IN' : 'IN');

function pushObservation({ ctx, templateId, observedAt, values, media, comment, gelled = false, idPrefix }) {
  const tpl = templateById[templateId];
  const observer = pick(users.filter((u) => u.role === 'SCIENTIST'));
  const observed = new Date(observedAt);
  const status = observed < new Date('2026-08-20') ? 'REVIEWED' : 'SUBMITTED';
  const result = resultFrom(values, gelled);
  values.push(val('overall_comments', comment));
  const seq = observations.length.toString(16).padStart(12, '0');
  const observationId = `${idPrefix.padEnd(8, '0').slice(0, 8)}-${seq.slice(0, 4)}-4${seq.slice(4, 7)}-8${seq.slice(7, 10)}-${seq.slice(2, 12).padStart(12, '0')}`.toLowerCase();
  const doc = {
    schemaVersion: '1.0', observationId, versionNo: 1, status, context: ctx,
    template: { templateId: tpl.templateId, templateVersion: tpl.version, templateName: tpl.templateName },
    resultType: 'SCHEDULED', overallResult: result, overallResultNA: false,
    observer: { userId: observer.userId, displayName: observer.displayName, upn: observer.upn, role: observer.role },
    observedAt, submittedAt: new Date(observed.getTime() + 25 * 60000).toISOString(),
    device: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)', platform: 'iPadOS', online: true },
    values, media,
    audit: { createdBy: observer.userId, createdAt: observedAt, correlationId: `corr-${observationId.slice(-8)}`, previousVersionUri: null },
    ...(status === 'REVIEWED' ? { reviewedBy: 'u-oka', reviewedAt: new Date(observed.getTime() + 2 * 86400000).toISOString() } : {}),
  };
  observations.push(doc);
  auditLog.push({ auditId: `aud-${auditLog.length + 1}`, eventTime: doc.submittedAt, actorUserId: observer.userId, actorName: observer.displayName, actorRole: observer.role, action: 'CREATE', entityType: 'OBSERVATION', entityId: observationId, entityVersion: 1, correlationId: doc.audit.correlationId });
  if (status === 'REVIEWED') auditLog.push({ auditId: `aud-${auditLog.length + 1}`, eventTime: doc.reviewedAt, actorUserId: 'u-oka', actorName: 'D. Oka', actorRole: 'REVIEWER', action: 'REVIEW', entityType: 'OBSERVATION', entityId: observationId, entityVersion: 1, correlationId: doc.audit.correlationId });
}

const contextValues = (fmt, container, ctxExtra = []) => [val('product_format', fmt), val('container_type', container), val('sample_storage_orientation', 'UPRIGHT'), val('sample_opened_previously', false), val('plan_status', 'ACTIVE'), val('shake_protocol', 'SOP_10X_180'), val('exclude_from_trend', false), ...ctxExtra];

// ---- AR-10421 / 10421.001: the full SOP questionnaire, 3 variants x 4 conditions, T0 to 6M
{
  const plan = plans[0]; const trial = trials[0];
  const vs = variants.filter((v) => v.trialNumber === trial.trialNumber);
  vs.forEach((v, vi) => plan.conditions.forEach((cond) => {
    const sample = samples.find((s) => s.variantId === v.variantId && s.conditionCode === cond);
    const temp = { '4C': 4, '25C': 25, '35C': 35, '45C': 45 }[cond];
    ['T0', '1M', '3M', '6M'].forEach((tp, ti) => {
      const due = new Date(dueDate(plan, tp) + 'T09:30:00'); if (due > TODAY) return;
      const observed = new Date(due.getTime() + Math.floor(rand() * 240) * 60000); const observedAt = observed.toISOString();
      const ctx = { projectCode: 'PRJ-2026-014', arNumber: 'AR-10421', trialNumber: trial.trialNumber, variantId: v.variantId, variantNumber: v.variantNumber, sampleCode: sample.sampleCode, timePointCode: tp, conditionCode: cond, planId: plan.planId, planVersion: plan.planVersion, formulationClass: 'LIQUID_RTD', sourceSystem: 'REFERENCE_STORE' };
      const stress = (ti / 3) * (temp / 45) * (vi === 0 ? 1.4 : vi === 1 ? 0.8 : 0.5); // V1 baseline creams most
      const media = [mediaFor(ctx, 'general_overview_photo', observedAt), mediaFor(ctx, 'general_empty_bottle_photo', observedAt), mediaFor(ctx, 'homog_unshaken_photo', observedAt)];
      const m = (fc) => media.find((x) => x.fieldCode === fc)?.mediaAssetId || null;
      const homogeneous = stress < 0.25;
      const creaming = stress > 0.18; const creamMm = creaming ? round(0.6 + stress * 9 + rand() * 0.6, 1) : null; const shakesIn = creaming ? stress < 0.55 : null;
      const serum = stress > 0.3; const serumPct = serum ? round(0.8 + stress * 9 + rand() * 0.5, 1) : null;
      const sediment = stress > 0.4 || (vi === 0 && ti >= 2 && temp >= 35); const sedMm = sediment ? round(0.8 + stress * 6, 1) : null; const sedSh = sediment ? round(sedMm * (stress > 0.7 ? 0.45 : 0.2), 1) : null;
      const gelled = vi === 0 && temp === 45 && ti === 3; // V1 at 45°C, 6 months: soft gel, unshaken too thick to pour
      const rippling = stress > 0.35 && !gelled;
      const values = [...contextValues('BOTTLE_PET', 'CLEAR_PLASTIC', [val('package_volume_ml', 237), val('package_fill_height_mm', 148), val('sample_temperature_at_test', round(20 + rand() * 2, 1))]), ...labValues(cond, ti, temp, vi),
        val('general_overview_photo', [m('general_overview_photo')], { mediaAssetId: m('general_overview_photo') }), val('general_empty_bottle_photo', [m('general_empty_bottle_photo')], { mediaAssetId: m('general_empty_bottle_photo') }),
        val('homog_unshaken_homogeneous', homogeneous && !gelled), val('homog_unshaken_photo', [m('homog_unshaken_photo')], { mediaAssetId: m('homog_unshaken_photo') }), val('homog_shaken_test_performed', !homogeneous || gelled)];
      if (!homogeneous || gelled) values.push(val('homog_unshaken_appearance', gelled ? 'DISTINCT_PHASES' : stress > 0.5 ? 'DISTINCT_PHASES' : 'SLIGHT_LAYERING'), val('homog_shaken_homogeneous', stress < 0.6 && !gelled), val('homog_post_shake_color_change', false));
      if (gelled) {
        // The spreadsheet case: unshaken ratings not evaluable, shaken still recorded
        values.push(val('cream_unsh_present', true), na('cream_unsh_rating', 'Gelled or too thick to pour'), val('cream_sh_rating', '0'), val('cream_sh_shakes_in', true), val('cream_sh_result', 'FULLY_REDISPERSED'),
          val('serum_unsh_present', true), na('serum_unsh_rating', 'Gelled or too thick to pour'), val('serum_unsh_locations', ['TOP']), val('serum_sh_rating', '0'), val('serum_sh_shakes_in', true), val('serum_sh_result', 'FULLY_REDISPERSED'),
          val('sed_unsh_present', true), na('sed_unsh_rating', 'Gelled or too thick to pour'), val('sed_sh_rating', '2'), val('sed_sh_height_value', 1.5), val('sed_sh_height_unit', 'MM'), val('sed_sh_shake_in_extent', 'PARTIAL'), val('sed_predominant_type', 'PROTEIN'),
          val('gel_gelled', true), val('gel_firmness', 'SOFT'), val('gel_too_thick_to_pour', true), val('gel_shake_test_performed', true), val('gel_reversibility', 'PARTIALLY_REVERSIBLE'), val('gel_spoilage_related', 'NO'),
          val('nh_rippling_present', false), val('nh_lumps_present', true), val('nh_lumps_severity', 'MODERATE'), val('nh_lumps_context', ['AFTER_SHAKING']), val('nh_sieve_used', true), val('nh_sieve_mesh', '1 mm'), val('nh_smooth_after_shaking', false), val('psag_vertical_stripes_present', false));
        media.push(mediaFor(ctx, 'gel_photo', observedAt)); values.push(val('gel_photo', [m('gel_photo')], { mediaAssetId: m('gel_photo') }));
        pushObservation({ ctx, templateId: 'TPL_RTD_MVP', observedAt, values, media, gelled: true, idPrefix: `5f1a${vi}${cond.replace(/\D/g, '').padStart(2, '0')}`, comment: 'Soft gel unshaken, too thick to pour. Pudding texture once shaken, slight lumping on the sieve. Serum on top before shaking.' });
        return;
      }
      values.push(val('cream_unsh_present', creaming));
      if (creaming) {
        media.push(mediaFor(ctx, 'cream_unsh_photo', observedAt));
        values.push(val('cream_unsh_layer_measurable', true), val('cream_unsh_layer_thickness_value', creamMm), val('cream_unsh_layer_thickness_unit', 'MM'),
          val('cream_unsh_layer_description', creamMm >= 10 ? 'VERY_HEAVY_RING' : creamMm >= 8 ? 'HEAVY_RING' : creamMm >= 5 ? 'DISTINCT_RING' : creamMm >= 1 ? 'SLIGHT_THIN_RING' : 'TRACE'), val('cream_unsh_layer_color', vi === 2 ? 'PALE_YELLOW' : 'WHITE'),
          val('cream_unsh_marbling_present', stress > 0.35), val('cream_unsh_minor_spots_present', stress < 0.3), val('cream_unsh_photo', [m('cream_unsh_photo')], { mediaAssetId: m('cream_unsh_photo') }),
          val('cream_sh_shakes_in', shakesIn), val('cream_sh_result', shakesIn ? 'FULLY_REDISPERSED' : stress > 0.75 ? 'NOT_REDISPERSED' : 'PARTIAL'), val('cream_emulsifier_flag', !shakesIn), val('cream_rim_dried_residue_present', vi === 1 && ti === 1));
        if (vi === 1 && ti === 1) values.push(val('cream_rim_residue_fatty', false));
        if (!shakesIn) values.push(val('cream_sh_residual_pct', round(stress * 40, 0)), val('cream_sh_residue_type', stress > 0.75 ? ['PLUG_AT_SPOUT', 'FAT_RING_ON_BOTTLE'] : ['FAT_RING_ON_BOTTLE']), val('cream_review_prompt', true));
        if (stress > 0.5) { media.push(mediaFor(ctx, 'cream_unsh_pour_out_video', observedAt, 'VIDEO')); values.push(val('cream_unsh_pour_out_video', [m('cream_unsh_pour_out_video')], { mediaAssetId: m('cream_unsh_pour_out_video') }), val('cream_unsh_pour_out_result', stress > 0.75 ? 'PLUG_REMAINS' : 'RESIDUE_ON_WALL')); }
        else values.push(na('cream_unsh_pour_out_result', 'Test not performed at this pull'));
      }
      values.push(val('serum_unsh_present', serum));
      if (serum) {
        media.push(mediaFor(ctx, 'serum_unsh_photo', observedAt));
        values.push(val('serum_unsh_measurable', true), val('serum_unsh_value', round(serumPct * 1.48, 1)), val('serum_unsh_unit', 'MM'), val('serum_unsh_pct_package_volume', serumPct), val('serum_unsh_locations', stress > 0.6 ? ['TOP', 'SIDE_WALL'] : ['TOP']),
          val('serum_unsh_clarity', 'TRANSLUCENT'), val('serum_unsh_color', 'TRANSLUCENT'), val('serum_unsh_photo', [m('serum_unsh_photo')], { mediaAssetId: m('serum_unsh_photo') }),
          val('serum_sh_shakes_in', stress < 0.7), val('serum_sh_result', stress < 0.7 ? 'FULLY_REDISPERSED' : 'PARTIAL'), val('serum_gelation_flag', false), val('serum_protein_flag', stress > 0.6), val('serum_scale_up_viscosity_warning', vi === 0 && stress > 0.5));
        if (stress >= 0.7) values.push(val('serum_sh_value', round(serumPct * 0.3, 1)), val('serum_sh_unit', 'PCT'));
      }
      values.push(val('sed_unsh_present', sediment), val('sed_bottle_coating_present', vi === 1 && stress > 0.5));
      if (sediment) {
        media.push(mediaFor(ctx, 'sed_unsh_photo', observedAt));
        values.push(val('sed_unsh_height_value', sedMm), val('sed_unsh_height_unit', 'MM'), val('sed_unsh_coverage', sedMm >= 4 ? 'ENTIRE_BOTTOM' : sedMm >= 2 ? 'OUTER_RING_CLEAR_CENTER' : 'PARTIAL_RING'), val('sed_unsh_texture', stress > 0.6 ? 'COMPACT' : 'SOFT'),
          val('sed_measurement_point', 'AFTER_POUR'), val('sed_measurement_location', 'OUTER_RIM'), val('sed_bottle_cut_to_evaluate', false), val('sed_unsh_photo', [m('sed_unsh_photo')], { mediaAssetId: m('sed_unsh_photo') }),
          val('sed_predominant_type', 'PROTEIN'), val('sed_sh_height_value', sedSh), val('sed_sh_height_unit', 'MM'), val('sed_sh_shake_in_extent', stress > 0.7 ? 'PARTIAL' : 'COMPLETE'), val('sed_sh_lumps_present', stress > 0.8), val('sed_composition_test_requested', false));
        if (stress > 0.7) values.push(val('sed_prot_review_prompt', true));
        if (stress > 0.55) values.push(na('sed_weight_g', 'Test not performed at this pull'));
      }
      values.push(val('gel_gelled', false), val('nh_rippling_present', rippling), val('nh_lumps_present', stress > 0.6), val('nh_sieve_used', stress > 0.6), val('nh_smooth_after_shaking', stress < 0.75), val('psag_vertical_stripes_present', vi === 0 && stress > 0.45));
      if (stress > 0.6) values.push(val('nh_lumps_severity', stress > 0.8 ? 'MODERATE' : 'SLIGHT'), val('nh_lumps_context', ['UNSHAKEN_POUR']), val('nh_sieve_mesh', '1 mm'));
      if (vi === 0 && stress > 0.45) values.push(val('psag_stripe_coverage', 'PARTIAL'));
      withRatings(values, sample);
      const comment = !creaming && !serum && !sediment ? 'Smooth, no visual separation.' : rippling ? 'Rippling when pouring, smooth when shaken. Slightly thicker mouthfeel than the refrigerated sample, no hard lumps.' : 'Layer redisperses with the standard shake; monitor at the next pull.';
      pushObservation({ ctx, templateId: 'TPL_RTD_MVP', observedAt, values, media, idPrefix: `5f1a${vi}${cond.replace(/\D/g, '').padStart(2, '0')}`, comment });
    });
  }));
}

// ---- Other ARs: lighter seeding so the program view, plan grids and reports look like a running lab
const otherSpecs = [
  { plan: plans[1], templateId: 'TPL_RTD_QUICK', trial: trials[2], fmt: 'CAN', container: 'METAL', kind: 'rtd' },
  { plan: plans[2], templateId: 'TPL_RTD_MVP', trial: trials[3], fmt: 'TETRA', container: 'LAMINATE', kind: 'serum' },
  { plan: plans[3], templateId: 'TPL_POWDER', trial: trials[4], fmt: 'TUB', container: 'OPAQUE_PLASTIC', kind: 'powder' },
  { plan: plans[4], templateId: 'TPL_VMS', trial: trials[5], fmt: 'JAR', container: 'OPAQUE_PLASTIC', kind: 'vms' },
];
otherSpecs.forEach((spec, si) => {
  const vs = variants.filter((v) => v.trialNumber === spec.trial.trialNumber);
  const project = ars.find((a) => a.arNumber === spec.plan.arNumber).projectCode;
  vs.forEach((v, vi) => spec.plan.conditions.forEach((cond) => {
    const sample = samples.find((s) => s.variantId === v.variantId && s.conditionCode === cond);
    const temp = { '4C': 4, '25C': 25, '35C': 35, '45C': 45 }[cond];
    spec.plan.timePoints.forEach((tp, ti) => {
      const due = new Date(dueDate(spec.plan, tp) + 'T10:15:00');
      if (due > new Date('2026-08-24')) return; // leave the latest pulls open so the work list has something on it
      const observed = new Date(due.getTime() + Math.floor(rand() * 3) * 86400000 + Math.floor(rand() * 300) * 60000); const observedAt = observed.toISOString();
      const ctx = { projectCode: project, arNumber: spec.plan.arNumber, trialNumber: spec.trial.trialNumber, variantId: v.variantId, variantNumber: v.variantNumber, sampleCode: sample.sampleCode, timePointCode: tp, conditionCode: cond, planId: spec.plan.planId, planVersion: spec.plan.planVersion, formulationClass: spec.trial.formulationClass, sourceSystem: 'REFERENCE_STORE' };
      const stress = (ti / Math.max(1, spec.plan.timePoints.length - 1)) * (temp / 45) * (vi === 0 ? 1.2 : 0.7);
      const media = [mediaFor(ctx, 'general_overview_photo', observedAt)];
      const m = (fc) => media.find((x) => x.fieldCode === fc)?.mediaAssetId || null;
      const values = contextValues(spec.fmt, spec.container);
      values.push(val('general_overview_photo', [m('general_overview_photo')], { mediaAssetId: m('general_overview_photo') }));
      let comment = 'Smooth, no visual separation.';
      if (spec.kind === 'rtd' || spec.kind === 'serum') {
        media.push(mediaFor(ctx, 'general_empty_bottle_photo', observedAt)); values.push(val('general_empty_bottle_photo', [m('general_empty_bottle_photo')], { mediaAssetId: m('general_empty_bottle_photo') }));
        values.push(...labValues(cond, ti, temp, vi));
        const homogeneous = stress < 0.3;
        values.push(val('homog_unshaken_homogeneous', homogeneous));
        const serum = spec.kind === 'serum' ? stress > 0.15 : stress > 0.45; const creaming = spec.kind === 'rtd' ? stress > 0.35 : stress > 0.6; const sediment = stress > 0.7;
        values.push(val('cream_unsh_present', creaming), val('serum_unsh_present', serum), val('sed_unsh_present', sediment));
        if (creaming) { const mm = round(0.5 + stress * 5, 1); values.push(val('cream_sh_shakes_in', true), val('cream_sh_result', 'FULLY_REDISPERSED')); if (spec.templateId === 'TPL_RTD_MVP') { media.push(mediaFor(ctx, 'cream_unsh_photo', observedAt)); values.push(val('cream_unsh_layer_measurable', true), val('cream_unsh_layer_thickness_value', mm), val('cream_unsh_layer_thickness_unit', 'MM'), val('cream_unsh_layer_description', mm >= 5 ? 'DISTINCT_RING' : 'SLIGHT_THIN_RING'), val('cream_unsh_photo', [m('cream_unsh_photo')], { mediaAssetId: m('cream_unsh_photo') })); } else values.push(val('cream_unsh_rating', mm >= 8 ? '4' : mm >= 5 ? '3' : mm >= 1 ? '2' : '1')); }
        if (serum) { const pct = round(0.5 + stress * 6 * (vi === 0 ? 1 : 0.5), 1); values.push(val('serum_sh_shakes_in', pct < 4), val('serum_sh_result', pct < 4 ? 'FULLY_REDISPERSED' : 'PARTIAL')); if (spec.templateId === 'TPL_RTD_MVP') { media.push(mediaFor(ctx, 'serum_unsh_photo', observedAt)); values.push(val('serum_unsh_measurable', true), val('serum_unsh_pct_package_volume', pct), val('serum_unsh_locations', ['TOP']), val('serum_unsh_clarity', 'TRANSLUCENT'), val('serum_unsh_photo', [m('serum_unsh_photo')], { mediaAssetId: m('serum_unsh_photo') })); if (pct >= 4) values.push(val('serum_sh_value', round(pct * 0.3, 1)), val('serum_sh_unit', 'PCT')); } else values.push(val('serum_unsh_rating', pct >= 7.5 ? '4' : pct >= 3.5 ? '3' : pct >= 1 ? '2' : '1'), val('serum_sh_rating', pct < 4 ? '0' : '2')); }
        if (sediment) { const mm = round(0.5 + stress * 3, 1); values.push(val('sed_unsh_height_value', mm), val('sed_unsh_height_unit', 'MM'), val('sed_sh_height_value', round(mm * 0.3, 1)), val('sed_sh_height_unit', 'MM'), val('sed_sh_shake_in_extent', 'COMPLETE')); if (spec.templateId === 'TPL_RTD_MVP') { media.push(mediaFor(ctx, 'sed_unsh_photo', observedAt)); values.push(val('sed_unsh_coverage', 'OUTER_RING_CLEAR_CENTER'), val('sed_unsh_texture', 'SOFT'), val('sed_measurement_point', 'AFTER_POUR'), val('sed_measurement_location', 'OUTER_RIM'), val('sed_predominant_type', 'MINERAL'), val('sed_min_appearance', 'FINE_POWDER'), val('sed_min_review_prompt', true), val('sed_unsh_photo', [m('sed_unsh_photo')], { mediaAssetId: m('sed_unsh_photo') })); } }
        values.push(val('sed_bottle_coating_present', false), val('gel_gelled', false), val('nh_rippling_present', stress > 0.5), val('nh_lumps_present', false), val('nh_smooth_after_shaking', true));
        if (spec.templateId === 'TPL_RTD_MVP') values.push(val('psag_vertical_stripes_present', false), val('nh_sieve_used', false));
        withRatings(values, sample);
        if (serum || creaming) comment = 'Slight serum line when pouring; shakes in fully.';
      } else if (spec.kind === 'powder') {
        const sev = (x) => (x > 0.65 ? 'SEVERE' : x > 0.4 ? 'MODERATE' : x > 0.2 ? 'SLIGHT' : 'NONE');
        const caking = sev(stress * (vi === 0 ? 1.3 : 0.6));
        media.push(mediaFor(ctx, 'pwd_photo', observedAt));
        values.push(val('pwd_caking', caking), val('pwd_flowability', caking === 'NONE' ? 'FREE_FLOWING' : caking === 'SLIGHT' ? 'SLIGHTLY_COHESIVE' : caking === 'MODERATE' ? 'COHESIVE' : 'NON_FLOWING'), val('pwd_color_change', sev(stress * 0.5)), val('pwd_lumps_present', caking !== 'NONE'), val('pwd_wettability_s', round(8 + stress * 30, 0)), val('pwd_dissolution_s', round(25 + stress * 60, 0)), val('pwd_foaming', 'SLIGHT'), val('pwd_photo', [m('pwd_photo')], { mediaAssetId: m('pwd_photo') }));
        values.push(val('cream_unsh_rating', caking === 'SEVERE' ? '4' : caking === 'MODERATE' ? '2' : '0')); // stands in for the overall result driver in resultFrom
        comment = caking === 'NONE' ? 'Free flowing, no caking.' : `${caking.toLowerCase()} caking; lumps break up on tapping.`;
      } else {
        const sev = (x) => (x > 0.7 ? 'SEVERE' : x > 0.45 ? 'MODERATE' : x > 0.2 ? 'SLIGHT' : 'NONE');
        const app = sev(stress * (vi === 0 ? 0.9 : 1.2));
        media.push(mediaFor(ctx, 'vms_photo', observedAt));
        values.push(val('vms_appearance_change', app), val('vms_surface_mottling', sev(stress * 0.7)), val('vms_chipping_capping', false), val('vms_hardness_kp', round(6.2 - stress * 2, 1)), val('vms_disintegration_min', round(14 + stress * 12, 0)), val('vms_odor_change', sev(stress * 0.4)), val('vms_capsule_leakage', false), val('vms_photo', [m('vms_photo')], { mediaAssetId: m('vms_photo') }));
        values.push(val('cream_unsh_rating', app === 'SEVERE' ? '4' : app === 'MODERATE' ? '2' : '0'));
        comment = app === 'NONE' ? 'No appearance change.' : `${app.toLowerCase()} appearance change vs T0.`;
      }
      pushObservation({ ctx, templateId: spec.templateId, observedAt, values, media, idPrefix: `7a${si}${vi}${cond.replace(/\D/g, '').padStart(2, '0')}`, comment });
    });
  }));
});
// Powder and VMS have no creaming: drop the stand-in rating that only drove the overall result
observations.forEach((o) => { if (o.context.formulationClass !== 'LIQUID_RTD') o.values = o.values.filter((v) => v.fieldCode !== 'cream_unsh_rating'); });

auditLog.push({ auditId: `aud-${auditLog.length + 1}`, eventTime: '2026-06-02T14:05:00Z', actorUserId: 'u-ingalls', actorName: 'N. Ingalls', actorRole: 'ADMIN', action: 'CONFIG_CHANGE', entityType: 'TEMPLATE', entityId: 'TPL_RTD_MVP', entityVersion: 1, correlationId: 'corr-cfg-0001' });
auditLog.push({ auditId: `aud-${auditLog.length + 1}`, eventTime: '2026-07-14T10:40:00Z', actorUserId: 'u-ingalls', actorName: 'N. Ingalls', actorRole: 'ADMIN', action: 'CONFIG_CHANGE', entityType: 'VOCABULARY', entityId: 'COLOR_DESC', entityVersion: null, correlationId: 'corr-cfg-0002' });
observations.sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1));
