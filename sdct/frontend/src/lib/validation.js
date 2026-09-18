import { isVisible } from './branching.js';

// Fields the scientist never types: referenced from the reference data (NESTMS via Blob) or managed by the system
const SYSTEM = new Set(['formulation_class', 'test_status']);
export const isSystemField = (f) => f.dataType === 'ref' || SYSTEM.has(f.fieldCode);

export function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function isRequired(field, template) {
  const o = template?.requiredOverrides?.[field.fieldCode];
  return typeof o === 'boolean' ? o : field.requiredDefault;
}

// Required-field and metadata completeness check before submission (R-18). Returns [] when the observation can be submitted.
export function validateObservation({ fields, fieldIndex, values, template, context }) {
  const problems = [];
  const ctxRequired = ['projectCode', 'arNumber', 'trialNumber', 'sampleCode', 'timePointCode', 'conditionCode', 'formulationClass'];
  ctxRequired.forEach((k) => { if (isEmpty(context?.[k])) problems.push({ fieldCode: `context.${k}`, label: labelFor(k), reason: 'Context is missing' }); });

  fields.forEach((f) => {
    if (f.dataType === 'guidance' || isSystemField(f)) return;
    if (!isVisible(f, values, fieldIndex)) return;
    const req = isRequired(f, template);
    const entry = values[f.fieldCode];
    if (entry?.isNA && f.allowNA) return;
    if (entry?.isNA && !f.allowNA) problems.push({ fieldCode: f.fieldCode, label: f.label, reason: 'Not applicable is not allowed for this field' });
    if (req && isEmpty(entry?.value)) {
      problems.push({ fieldCode: f.fieldCode, label: f.label, reason: f.dataType.startsWith('media') ? 'Photo or video required' : 'Required' });
    }
    if (!isEmpty(entry?.value)) {
      if (f.dataType === 'percent' && (entry.value < 0 || entry.value > 100)) problems.push({ fieldCode: f.fieldCode, label: f.label, reason: 'Percent must be between 0 and 100' });
      if ((f.dataType === 'number' || f.dataType === 'integer') && Number.isNaN(Number(entry.value))) problems.push({ fieldCode: f.fieldCode, label: f.label, reason: 'Enter a number' });
      if (f.dataType === 'integer' && !Number.isInteger(Number(entry.value))) problems.push({ fieldCode: f.fieldCode, label: f.label, reason: 'Enter a whole number' });
      if (String(entry.value) === '9999') problems.push({ fieldCode: f.fieldCode, label: f.label, reason: 'Use the N/A option instead of 9999' });
    }
  });
  return problems;
}

function labelFor(k) {
  return { projectCode: 'Project', arNumber: 'Stability AR', trialNumber: 'Trial', sampleCode: 'Sample', timePointCode: 'Time point', conditionCode: 'Storage condition', formulationClass: 'Formulation class' }[k] || k;
}

export function completeness({ fields, fieldIndex, values, template }) {
  let required = 0; let done = 0;
  fields.forEach((f) => {
    if (f.dataType === 'guidance' || isSystemField(f)) return;
    if (!isVisible(f, values, fieldIndex)) return;
    if (!isRequired(f, template)) return;
    required += 1;
    const e = values[f.fieldCode];
    if ((e?.isNA && f.allowNA) || !isEmpty(e?.value)) done += 1;
  });
  return { required, done };
}
