// Small CSV parser for the template builder's "import field list" (the transcript: load 150 fields from a CSV, pick the 40 you need).
export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') inQ = false; else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Match imported rows to catalog fields by field_code, then by label (case-insensitive). Unmatched rows are returned for review.
export function matchImportedFields(rows, catalogFields) {
  const byCode = new Map(catalogFields.map((f) => [f.fieldCode.toLowerCase(), f]));
  const byLabel = new Map(catalogFields.map((f) => [f.label.toLowerCase(), f]));
  const matched = []; const unmatched = [];
  rows.forEach((r) => {
    const code = (r.field_code || r.fieldCode || r.code || '').toLowerCase();
    const label = (r.field_name || r.label || r.name || '').toLowerCase();
    const f = byCode.get(code) || byLabel.get(label);
    if (f) matched.push(f); else unmatched.push(r);
  });
  return { matched, unmatched };
}
