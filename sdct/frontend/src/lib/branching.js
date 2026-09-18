// Conditional / branching questionnaire logic (R-16). A field is shown when its parent field has one of the trigger values.
// Boolean parents: 'Y' matches true, 'N' matches false. Select parents: value code match. Multiselect parents: any overlap.

function matches(parentValue, trigger) {
  if (parentValue === undefined || parentValue === null || parentValue === '') return false;
  if (typeof parentValue === 'boolean') return (trigger === 'Y' && parentValue) || (trigger === 'N' && !parentValue) || String(parentValue).toUpperCase() === trigger;
  if (Array.isArray(parentValue)) return parentValue.includes(trigger);
  return String(parentValue) === trigger;
}

export function isVisible(field, values, fieldIndex) {
  if (!field.dependsOnField) return true;
  const parentField = fieldIndex[field.dependsOnField];
  // A hidden parent hides its children too (nested branching)
  if (parentField && !isVisible(parentField, values, fieldIndex)) return false;
  const parent = values[field.dependsOnField];
  if (!parent || parent.isNA) return false;
  const triggers = field.dependsOnValues && field.dependsOnValues.length ? field.dependsOnValues : ['Y'];
  return triggers.some((t) => matches(parent.value, t));
}

export function visibleFields(fields, values, fieldIndex) {
  return fields.filter((f) => isVisible(f, values, fieldIndex));
}
