// Standard media naming convention (R-22, proposal for OI-4). Mirrored in backend/api/src/services/naming.js.
//
//   {PROJECT}_{AR}_{TRIAL}_V{VARIANT}_{TIMEPOINT}_{CONDITION}_{DOMAIN}_{FIELD}_{YYYYMMDD}-{HHMMSS}_{SEQ}.{ext}
//   PRJ2026014_AR-10421_T01_V2_6M_25C_CREAM_UNSH-PHOTO_20260831-101502_01.jpg
//
// Tokens are upper case; the project token is alphanumeric only, the others allow hyphens.

const DOMAIN_SHORT = {
  TEST_CONTEXT: 'CTX', LAB_RESULTS: 'LAB', GENERAL_MEDIA: 'GEN', HOMOG: 'HOMOG', CREAMING: 'CREAM', SERUM: 'SERUM',
  SEDIMENT: 'SED', GELLING: 'GEL', NON_HOMOG: 'NONHOM', PROTEIN_SAG: 'PSAG', EXT_POWDER: 'PWD', EXT_VMS: 'VMS',
};
const FIELD_PREFIX = /^(homog|cream|serum|sed|gel|nh|psag|pwd|vms|general)_/;

export function sanitizeToken(value, { allowHyphen = true } = {}) {
  // Dots in NESTMS trial codes (33440.008) become hyphens so the token stays readable; project tokens stay alphanumeric
  const s = String(value ?? '').toUpperCase().replace(/[.\s/]+/g, '-').replace(allowHyphen ? /[^A-Z0-9-]/g : /[^A-Z0-9]/g, '');
  return s || 'NA';
}

export function fieldShort(fieldCode) {
  return sanitizeToken(String(fieldCode).replace(FIELD_PREFIX, '').replace(/_/g, '-'));
}

export function domainShort(domainCode) {
  return DOMAIN_SHORT[domainCode] || sanitizeToken(domainCode).slice(0, 6);
}

export function timestampToken(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function extensionFor(contentType, originalName = '') {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
  if (map[contentType]) return map[contentType];
  const m = /\.([a-z0-9]+)$/i.exec(originalName);
  return m ? m[1].toLowerCase() : 'bin';
}

export function standardFilename({ projectCode, arNumber, trialNumber, variantNumber, timePointCode, conditionCode, domainCode, fieldCode, capturedAt, seq = 1, contentType, originalName }) {
  const parts = [
    sanitizeToken(projectCode, { allowHyphen: false }),
    sanitizeToken(arNumber),
    sanitizeToken(trialNumber),
    'V' + sanitizeToken(variantNumber).replace(/^V/, ''),
    sanitizeToken(timePointCode),
    sanitizeToken(conditionCode),
    domainShort(domainCode),
    fieldShort(fieldCode),
    timestampToken(capturedAt || new Date()),
    String(seq).padStart(2, '0'),
  ];
  return `${parts.join('_')}.${extensionFor(contentType, originalName)}`;
}

// Blob path under the media container: {PROJECT}/{AR}/{TRIAL}/{filename}
export function mediaBlobPath(ctx, filename) {
  return [sanitizeToken(ctx.projectCode, { allowHyphen: false }), sanitizeToken(ctx.arNumber), sanitizeToken(ctx.trialNumber), filename].join('/');
}

// Blob path under the observations container: {PROJECT}/{AR}/{TRIAL}/{observationId}.json (blob versioning keeps history)
export function observationBlobPath(ctx, observationId) {
  return [sanitizeToken(ctx.projectCode, { allowHyphen: false }), sanitizeToken(ctx.arNumber), sanitizeToken(ctx.trialNumber), `${observationId}.json`].join('/');
}
