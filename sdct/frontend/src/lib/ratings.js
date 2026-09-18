// SOP RDBW-SOP-00000202, Tables 2 to 4. A suggestion, never an override: the scientist confirms or changes it.
// Returns { rating: '0'..'5', basis: 'text' } or null when there is nothing to derive from.

const num = (e) => (e && !e.isNA && e.value !== null && e.value !== undefined && e.value !== '' ? Number(e.value) : null);
const bool = (e) => (e && !e.isNA ? e.value : undefined);
const toMm = (value, unitEntry) => (unitEntry?.value === 'CM' ? value * 10 : value);

// Table 2: 0 none, 1 trace, 2 slight thin ring (<5 mm), 3 distinct 5 to 8 mm, 4 heavy 8 to 10 mm, 5 very heavy 10 mm+
export function suggestCreamingUnshaken(v) {
  const present = bool(v.cream_unsh_present);
  if (present === false) return { rating: '0', basis: 'no creaming present' };
  if (present !== true) return null;
  const mm = num(v.cream_unsh_layer_thickness_value);
  if (mm !== null) {
    const t = toMm(mm, v.cream_unsh_layer_thickness_unit);
    const r = t >= 10 ? '5' : t >= 8 ? '4' : t >= 5 ? '3' : t >= 1 ? '2' : '1';
    return { rating: r, basis: `${t} mm ring (SOP Table 2)` };
  }
  const desc = v.cream_unsh_layer_description?.value;
  const byDesc = { TRACE: '1', SLIGHT_THIN_RING: '2', DISTINCT_RING: '3', HEAVY_RING: '4', VERY_HEAVY_RING: '5' };
  if (desc && byDesc[desc]) return { rating: byDesc[desc], basis: 'layer description' };
  if (bool(v.cream_unsh_marbling_present) === true || bool(v.cream_unsh_minor_spots_present) === true) return { rating: '1', basis: 'marbling or spots only' };
  return null;
}

export function suggestCreamingShaken(v) {
  if (bool(v.cream_unsh_present) === false) return { rating: '0', basis: 'no creaming present' };
  const res = v.cream_sh_result?.value;
  if (bool(v.cream_sh_shakes_in) === true || res === 'FULLY_REDISPERSED') return { rating: '0', basis: 'layer shook in' };
  const residual = num(v.cream_sh_residual_pct);
  if (residual !== null) { const r = residual >= 60 ? '5' : residual >= 40 ? '4' : residual >= 20 ? '3' : residual >= 5 ? '2' : '1'; return { rating: r, basis: `${residual}% residual cream` }; }
  if (res === 'NOT_REDISPERSED') return { rating: '4', basis: 'did not redisperse; adjust to what you see' };
  if (res === 'PARTIAL') return { rating: '2', basis: 'partial redispersion; adjust to what you see' };
  return null;
}

// Table 3: 0 none, 1 trace line during pouring, 2 slight ~2% of package volume, 3 distinct ~5%, 4 heavy ~10%, 5 very heavy 20%+
export function suggestSerumUnshaken(v) {
  const present = bool(v.serum_unsh_present);
  if (present === false) return { rating: '0', basis: 'no serum present' };
  if (present !== true) return null;
  let pct = num(v.serum_unsh_pct_package_volume);
  if (pct === null && v.serum_unsh_unit?.value === 'PCT') pct = num(v.serum_unsh_value);
  if (pct !== null) { const r = pct >= 15 ? '5' : pct >= 7.5 ? '4' : pct >= 3.5 ? '3' : pct >= 1 ? '2' : '1'; return { rating: r, basis: `${pct}% of package volume (SOP Table 3)` }; }
  if (bool(v.serum_unsh_measurable) === false) return { rating: '1', basis: 'present but not measurable (trace)' };
  return null;
}

export function suggestSerumShaken(v) {
  if (bool(v.serum_unsh_present) === false) return { rating: '0', basis: 'no serum present' };
  if (bool(v.serum_sh_shakes_in) === true || v.serum_sh_result?.value === 'FULLY_REDISPERSED') return { rating: '0', basis: 'serum shook in' };
  const residual = num(v.serum_sh_value);
  if (residual !== null && v.serum_sh_unit?.value === 'PCT') { const r = residual >= 15 ? '5' : residual >= 7.5 ? '4' : residual >= 3.5 ? '3' : residual >= 1 ? '2' : '1'; return { rating: r, basis: `${residual}% residual serum` }; }
  if (v.serum_sh_result?.value === 'PARTIAL') return { rating: '2', basis: 'partial redispersion; adjust to what you see' };
  if (v.serum_sh_result?.value === 'NOT_REDISPERSED') return { rating: '4', basis: 'did not redisperse; adjust to what you see' };
  return null;
}

// Table 4: 0 none, 1 trace partial ring / depressions, 2 slight complete ring 1 to 2 mm, 3 distinct ~3 mm heavier ring,
// 4 heavy ~4 mm entire bottom, 5 very heavy 5 mm+ entire bottom. Raised-center bottles (BOOST) need 4 mm for a 4.
function sedimentRating(mm, coverage, geometry) {
  const raised = geometry === 'RAISED_CENTER';
  if (mm !== null) {
    if (mm >= 5) return '5';
    if (mm >= (raised ? 4 : 3.5)) return coverage === 'ENTIRE_BOTTOM' || coverage === undefined ? '4' : '3';
    if (mm >= 2.5) return '3';
    if (mm >= 1) return coverage === 'PARTIAL_RING' || coverage === 'DEPRESSIONS_ONLY' ? '1' : '2';
    return coverage === 'COMPLETE_RING' ? '2' : '1';
  }
  if (coverage === 'PARTIAL_RING' || coverage === 'DEPRESSIONS_ONLY') return '1';
  if (coverage === 'COMPLETE_RING' || coverage === 'OUTER_RING_CLEAR_CENTER') return '2';
  if (coverage === 'ENTIRE_BOTTOM') return '4';
  return null;
}
export function suggestSedimentUnshaken(v, sample) {
  const present = bool(v.sed_unsh_present);
  if (present === false) return { rating: '0', basis: 'no sediment present' };
  if (present !== true) return null;
  const raw = num(v.sed_unsh_height_value);
  const mm = raw === null ? null : toMm(raw, v.sed_unsh_height_unit);
  const cov = v.sed_unsh_coverage?.value;
  const r = sedimentRating(mm, cov, sample?.bottleBaseGeometry);
  if (!r) return null;
  const parts = []; if (mm !== null) parts.push(`${mm} mm`); if (cov) parts.push(cov.toLowerCase().replace(/_/g, ' ')); if (sample?.bottleBaseGeometry === 'RAISED_CENTER') parts.push('raised-center bottle');
  return { rating: r, basis: `${parts.join(', ')} (SOP Table 4)` };
}
export function suggestSedimentShaken(v, sample) {
  if (bool(v.sed_unsh_present) === false) return { rating: '0', basis: 'no sediment present' };
  if (v.sed_sh_shake_in_extent?.value === 'COMPLETE') return { rating: '0', basis: 'sediment shook in completely' };
  const raw = num(v.sed_sh_height_value);
  if (raw === null) return null;
  const mm = toMm(raw, v.sed_sh_height_unit);
  const r = sedimentRating(mm, undefined, sample?.bottleBaseGeometry);
  return r ? { rating: r, basis: `${mm} mm after shaking (SOP Table 4)` } : null;
}

export const RATING_FIELDS = {
  cream_unsh_rating: (v, s) => suggestCreamingUnshaken(v, s),
  cream_sh_rating: (v, s) => suggestCreamingShaken(v, s),
  serum_unsh_rating: (v, s) => suggestSerumUnshaken(v, s),
  serum_sh_rating: (v, s) => suggestSerumShaken(v, s),
  sed_unsh_rating: (v, s) => suggestSedimentUnshaken(v, s),
  sed_sh_rating: (v, s) => suggestSedimentShaken(v, s),
};

export function suggestAll(values, sample) {
  const out = {};
  Object.entries(RATING_FIELDS).forEach(([code, fn]) => { const s = fn(values, sample); if (s) out[code] = s; });
  return out;
}
