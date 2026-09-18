import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useToast, Modal, Empty } from '../components/ui.jsx';
import { parseCSV, matchImportedFields } from '../lib/csv.js';
import { can } from '../auth/auth.js';

export function TemplatesScreen({ catalog, user }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState(''); const [dom, setDom] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [drag, setDrag] = useState(null);
  const fileRef = useRef(null);
  const fieldIndex = useMemo(() => Object.fromEntries(catalog.fields.map((f) => [f.fieldCode, f])), [catalog]);
  const canEdit = can(user, 'templates');

  const load = () => api.listTemplates().then(setTemplates);
  useEffect(() => { load(); }, []);

  const current = useMemo(() => { const m = new Map(); templates.forEach((t) => { const c = m.get(t.templateId); if (!c || t.version > c.version) m.set(t.templateId, t); }); return [...m.values()]; }, [templates]);
  const inTemplate = new Set(editing?.sections.flatMap((s) => s.fields) || []);
  const pickerFields = catalog.fields.filter((f) => (!dom || f.domainCode === dom) && (!q || f.label.toLowerCase().includes(q.toLowerCase()) || f.fieldCode.includes(q.toLowerCase())));

  const startNew = () => setEditing({ templateId: `TPL_${Date.now().toString(36).toUpperCase()}`, templateName: 'New template', formulationClass: 'LIQUID_RTD', status: 'DRAFT', description: '', sections: [{ label: 'Test context', fields: catalog.headerFields.filter((c) => fieldIndex[c]) }, { label: 'Sample media', fields: ['general_overview_photo'] }, { label: 'Observations', fields: [] }], requiredOverrides: {} });
  const startFrom = (t) => setEditing({ ...JSON.parse(JSON.stringify(t)), status: 'DRAFT', requiredOverrides: t.requiredOverrides || {} });
  const addField = (code, secIdx) => { if (inTemplate.has(code)) return; const s = [...editing.sections]; const i = secIdx ?? Math.max(0, s.length - 1); s[i] = { ...s[i], fields: [...s[i].fields, code] }; setEditing({ ...editing, sections: s }); };
  const addDomain = (domainCode) => { const codes = catalog.fields.filter((f) => f.domainCode === domainCode && !inTemplate.has(f.fieldCode)).map((f) => f.fieldCode); if (!codes.length) return; const name = catalog.domains.find((d) => d.domainCode === domainCode)?.name || domainCode; setEditing({ ...editing, sections: [...editing.sections, { label: name, fields: codes }] }); toast(`Added ${codes.length} ${name} fields as a section`); };
  const removeField = (secIdx, code) => { const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], fields: s[secIdx].fields.filter((c) => c !== code) }; setEditing({ ...editing, sections: s }); };
  const move = (secIdx, from, to) => { const s = [...editing.sections]; const arr = [...s[secIdx].fields]; if (to < 0 || to >= arr.length) return; const [x] = arr.splice(from, 1); arr.splice(to, 0, x); s[secIdx] = { ...s[secIdx], fields: arr }; setEditing({ ...editing, sections: s }); };
  const toggleReq = (code) => { const f = fieldIndex[code]; const cur = editing.requiredOverrides[code] ?? f.requiredDefault; setEditing({ ...editing, requiredOverrides: { ...editing.requiredOverrides, [code]: !cur } }); };
  const renameSec = (i, label) => { const s = [...editing.sections]; s[i] = { ...s[i], label }; setEditing({ ...editing, sections: s }); };
  const addSection = () => setEditing({ ...editing, sections: [...editing.sections, { label: `Section ${editing.sections.length + 1}`, fields: [] }] });
  const removeSection = (i) => setEditing({ ...editing, sections: editing.sections.filter((_, j) => j !== i) });

  const onDrop = (secIdx, toIdx) => { if (!drag) return; if (drag.secIdx === secIdx) move(secIdx, drag.idx, toIdx); else { const s = [...editing.sections]; const code = s[drag.secIdx].fields[drag.idx]; s[drag.secIdx] = { ...s[drag.secIdx], fields: s[drag.secIdx].fields.filter((c) => c !== code) }; const arr = [...s[secIdx].fields]; arr.splice(toIdx, 0, code); s[secIdx] = { ...s[secIdx], fields: arr }; setEditing({ ...editing, sections: s }); } setDrag(null); };

  const importCsv = async (file) => {
    const text = await file.text();
    const rows = parseCSV(text);
    const { matched, unmatched } = matchImportedFields(rows, catalog.fields);
    const fresh = matched.filter((f) => !inTemplate.has(f.fieldCode));
    if (fresh.length) { const s = [...editing.sections]; s.push({ label: `Imported from ${file.name}`, fields: fresh.map((f) => f.fieldCode) }); setEditing({ ...editing, sections: s }); }
    setImportResult({ file: file.name, rows: rows.length, matched: fresh.length, duplicates: matched.length - fresh.length, unmatched });
  };

  const save = async (status) => {
    const total = editing.sections.reduce((n, s) => n + s.fields.length, 0);
    if (!editing.templateName.trim()) return toast('Give the template a name', 'err');
    if (!total) return toast('Add at least one field', 'err');
    if (!inTemplate.has('general_overview_photo')) toast('Heads up: no overview photo in this template. Mandatory photo traceability comes from that field.', 'info', 5000);
    try { const saved = await api.saveTemplate({ ...editing, status }, user); toast(`Saved ${saved.templateName} as v${saved.version} (${status.toLowerCase()})`, 'ok'); setEditing(null); load(); } catch (e) { toast(e.message, 'err'); }
  };

  if (!editing) {
    return (
      <div className="stack">
        <div className="card">
          <div className="row spread">
            <div><h1>Questionnaire templates</h1><div className="muted small">A template is an ordered pick from the {catalog.coreFieldCount}-field catalog. Scientists choose a template and see only those fields, in that order. Saving creates a new version; earlier observations keep the version they were captured with.</div></div>
            {canEdit && <button className="btn primary" onClick={startNew}>New template</button>}
          </div>
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Template</th><th>Formulation class</th><th>Status</th><th>Version</th><th>Fields</th><th>Sections</th><th>Created</th><th /></tr></thead>
            <tbody>{current.map((t) => (
              <tr key={t.templateId}>
                <td><b>{t.templateName}</b><div className="small muted">{t.description}</div></td>
                <td>{t.formulationClass.replace('_', ' ')}</td><td><span className={`pill ${t.status === 'ACTIVE' ? 'ok' : ''}`}>{t.status.charAt(0) + t.status.slice(1).toLowerCase()}</span></td>
                <td>v{t.version}</td><td>{t.sections.reduce((n, s) => n + s.fields.length, 0)}</td><td>{t.sections.length}</td><td className="small">{t.createdBy} · {new Date(t.createdAt).toLocaleDateString()}</td>
                <td><div className="row" style={{ justifyContent: 'flex-end' }}>{canEdit ? <button className="btn sm" onClick={() => startFrom(t)}>Edit as new version</button> : <button className="btn sm" onClick={() => startFrom(t)}>View</button>}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!canEdit && <div className="hint">Your role ({user.role.toLowerCase()}) can view templates. Reviewers and admins can create versions.</div>}
      </div>
    );
  }

  const total = editing.sections.reduce((n, s) => n + s.fields.length, 0);
  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <div className="row" style={{ flex: 1 }}>
            <input className="field-input" style={{ maxWidth: 420, fontWeight: 600 }} value={editing.templateName} disabled={!canEdit} onChange={(e) => setEditing({ ...editing, templateName: e.target.value })} aria-label="Template name" />
            <select className="select" style={{ maxWidth: 180 }} value={editing.formulationClass} disabled={!canEdit} onChange={(e) => setEditing({ ...editing, formulationClass: e.target.value })} aria-label="Formulation class">
              {catalog.vocabularies.find((v) => v.code === 'FORMULATION_CLASS').values.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
            </select>
            <span className="pill">{total} fields · {editing.sections.length} sections</span>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setEditing(null)}>{canEdit ? 'Cancel' : 'Back'}</button>
            {canEdit && <><button className="btn" onClick={() => save('DRAFT')}>Save draft</button><button className="btn primary" onClick={() => save('ACTIVE')}>Publish as active</button></>}
          </div>
        </div>
        <input className="field-input" style={{ marginTop: 10, minHeight: 40, fontSize: 14 }} placeholder="Describe when to use this template" value={editing.description} disabled={!canEdit} onChange={(e) => setEditing({ ...editing, description: e.target.value })} aria-label="Description" />
      </div>

      <div className="builder">
        <div className="card">
          <h2>Field catalog</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <input className="field-input" style={{ minHeight: 40, fontSize: 14, flex: 1 }} placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search fields" />
            <select className="select" style={{ minHeight: 40, fontSize: 14, maxWidth: 190 }} value={dom} onChange={(e) => setDom(e.target.value)} aria-label="Domain"><option value="">All domains</option>{catalog.domains.map((d) => <option key={d.domainCode} value={d.domainCode}>{d.name}</option>)}</select>
          </div>
          {canEdit && (
            <div className="row" style={{ marginBottom: 8 }}>
              {dom && <button className="btn sm" onClick={() => addDomain(dom)}>Add all {catalog.domains.find((d) => d.domainCode === dom)?.shortName} fields as a section</button>}
              <button className="btn sm" onClick={() => fileRef.current?.click()}>Import field list (CSV)</button>
              <input ref={fileRef} type="file" hidden accept=".csv,text/csv" onChange={(e) => { if (e.target.files[0]) importCsv(e.target.files[0]); e.target.value = ''; }} />
            </div>
          )}
          <div className="picker-list">
            {pickerFields.map((f) => (
              <div key={f.fieldCode} className={`pick ${inTemplate.has(f.fieldCode) ? 'in' : ''}`} style={{ '--stripe': `var(--d-${f.domainCode})` }}>
                <div className="lbl"><b>{f.label}</b><small>{f.fieldCode} · {f.dataType}{f.unit ? ` · ${f.unit}` : ''}{f.dependsOnField ? ` · shown when ${fieldIndex[f.dependsOnField]?.label} = ${f.dependsOnValues?.join(' or ')}` : ''}</small></div>
                <span className={`badge ${f.taxonomyGroup === 'EXT' ? 'ext' : f.mvpScope === 'MVP' ? 'mvp' : ''}`}>{f.taxonomyGroup === 'EXT' ? 'Extension' : f.mvpScope === 'MVP' ? 'MVP' : 'Schema-ready'}</span>
                {canEdit && (inTemplate.has(f.fieldCode) ? <span className="badge">In template</span> : <button className="btn xs" onClick={() => addField(f.fieldCode)}>Add</button>)}
              </div>
            ))}
            {!pickerFields.length && <Empty title="No fields match">Try a different search or domain.</Empty>}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{pickerFields.length} of {catalog.fields.length} fields shown. Fields with a dependency only appear to the scientist when their parent answer triggers them.</div>
        </div>

        <div>
          {editing.sections.map((s, si) => (
            <div key={si} className="canvas-sec">
              <div className="sh">
                <input value={s.label} disabled={!canEdit} onChange={(e) => renameSec(si, e.target.value)} aria-label="Section name" />
                <span className="badge">{s.fields.length} fields</span>
                {canEdit && <button className="icon-btn" title="Remove section" onClick={() => removeSection(si)} aria-label="Remove section">✕</button>}
              </div>
              {s.fields.length === 0 && <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(si, 0)}>Add fields from the catalog on the left, or drag them here.</div>}
              {s.fields.map((code, i) => { const f = fieldIndex[code]; if (!f) return null; const req = editing.requiredOverrides[code] ?? f.requiredDefault; return (
                <div key={code} className={`canvas-item ${drag?.secIdx === si && drag?.idx === i ? 'dragging' : ''}`} style={{ '--stripe': `var(--d-${f.domainCode})` }} draggable={canEdit} onDragStart={() => setDrag({ secIdx: si, idx: i })} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(si, i)}>
                  <span className="muted small" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
                  <div className="lbl">{f.label}<small>{f.dataType}{f.unit ? ` · ${f.unit}` : ''}{f.allowNA ? ' · N/A allowed' : ''}{f.dependsOnField ? ` · branch of ${fieldIndex[f.dependsOnField]?.label}` : ''}</small></div>
                  {canEdit && <button className="btn xs req-toggle" aria-pressed={req} onClick={() => toggleReq(code)} title="Toggle required">{req ? 'Required' : 'Optional'}</button>}
                  {canEdit && <><button className="icon-btn" onClick={() => move(si, i, i - 1)} aria-label="Move up" disabled={i === 0}>↑</button><button className="icon-btn" onClick={() => move(si, i, i + 1)} aria-label="Move down" disabled={i === s.fields.length - 1}>↓</button><button className="icon-btn" onClick={() => removeField(si, code)} aria-label="Remove">✕</button></>}
                </div>
              ); })}
            </div>
          ))}
          {canEdit && <button className="btn" onClick={addSection}>Add section</button>}
        </div>
      </div>

      {importResult && (
        <Modal title="Field list imported" onClose={() => setImportResult(null)} footer={<button className="btn primary" onClick={() => setImportResult(null)}>Done</button>}>
          <div className="kv"><span className="k">File</span><span className="v">{importResult.file}</span><span className="k">Rows read</span><span className="v">{importResult.rows}</span><span className="k">Added to template</span><span className="v">{importResult.matched}</span><span className="k">Already in template</span><span className="v">{importResult.duplicates}</span><span className="k">Not in catalog</span><span className="v">{importResult.unmatched.length}</span></div>
          {importResult.unmatched.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="small muted">These rows did not match a catalog field by <code>field_code</code> or <code>field_name</code>. New fields are added to the catalog (field_catalog.csv), which regenerates the schema and this app's field list, so the questionnaire and the database never drift apart.</div>
              <ul className="small" style={{ marginTop: 6 }}>{importResult.unmatched.slice(0, 12).map((r, i) => <li key={i}><code>{Object.values(r).filter(Boolean).slice(0, 3).join(' · ')}</code></li>)}</ul>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
