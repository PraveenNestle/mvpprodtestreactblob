import React, { useEffect, useMemo, useState } from 'react';
import { api, DEMO_MODE } from '../api/index.js';
import { useToast, Modal, Empty } from '../components/ui.jsx';
import { can } from '../auth/auth.js';
import { fmtDateTime } from '../lib/format.js';

export function AdminScreen({ catalog, user, onCatalogChange }) {
  const toast = useToast();
  const [tab, setTab] = useState('vocab');
  const [vocab, setVocab] = useState(catalog.vocabularies[0]?.code || '');
  const [adding, setAdding] = useState(null);
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState([]);
  const [refStatus, setRefStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const refFile = React.useRef(null);
  const [q, setQ] = useState('');
  const isAdmin = can(user, 'admin');
  const v = catalog.vocabularies.find((x) => x.code === vocab);
  const usedBy = useMemo(() => catalog.fields.filter((f) => f.vocabularyCode === vocab), [catalog, vocab]);

  useEffect(() => { if (tab === 'audit') api.listAudit(200).then(setAudit); if (tab === 'users') api.getUsers().then(setUsers); if (tab === 'reference') api.getReferenceStatus().then(setRefStatus); }, [tab]);

  const importReference = async (file) => {
    setImporting(true);
    try {
      const bundle = JSON.parse(await file.text());
      const m = await api.importReference(bundle, user);
      setRefStatus(m); toast(`Reference data replaced: ${Object.entries(m.entities).map(([k, v]) => `${v.count} ${k}`).join(', ')}`, 'ok', 6000);
    } catch (e) { toast(`Import failed: ${e.message}`, 'err', 6000); } finally { setImporting(false); }
  };

  const addValue = async () => {
    if (!adding.code.trim() || !adding.label.trim()) return toast('Code and label are both needed', 'err');
    try { await api.addVocabularyValue(vocab, { code: adding.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), label: adding.label.trim() }, user); toast(`Added ${adding.label} to ${v.name}`, 'ok'); setAdding(null); onCatalogChange?.(); } catch (e) { toast(e.message, 'err'); }
  };
  const toggle = async (code) => { try { await api.toggleVocabularyValue(vocab, code, user); onCatalogChange?.(); } catch (e) { toast(e.message, 'err'); } };

  const fields = catalog.fields.filter((f) => !q || f.label.toLowerCase().includes(q.toLowerCase()) || f.fieldCode.includes(q.toLowerCase()) || f.domainCode.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="card">
        <h1>Administration</h1>
        <div className="muted small">Controlled vocabularies, the field catalog, reference data, the audit trail and role assignments. Changes here are versioned and audited; no code deployment is needed to add a descriptor value (R-38).</div>
        <div className="tabs" style={{ marginTop: 12, marginBottom: 0 }} role="tablist">
          {[['vocab', 'Vocabularies'], ['catalog', `Field catalog (${catalog.fields.length})`], ['reference', 'Reference data'], ['audit', 'Audit trail'], ['users', 'Users and roles']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>

      {tab === 'vocab' && (
        <div className="grid-2" style={{ gridTemplateColumns: '300px minmax(0, 1fr)' }}>
          <div className="card" style={{ padding: 8 }}>
            {catalog.vocabularies.map((x) => (
              <button key={x.code} type="button" className="rail-item" aria-current={vocab === x.code} onClick={() => setVocab(x.code)} style={{ paddingLeft: 10 }}>
                <span className="name">{x.name}</span><span className="count">{x.values.filter((y) => y.isActive).length}</span>
              </button>
            ))}
          </div>
          <div className="card">
            <div className="row spread">
              <div><h2 style={{ marginBottom: 2 }}>{v?.name}</h2><div className="small muted">Code <span className="mono">{v?.code}</span> · used by {usedBy.length} field{usedBy.length === 1 ? '' : 's'}: {usedBy.map((f) => f.label).slice(0, 4).join(', ')}{usedBy.length > 4 ? ` and ${usedBy.length - 4} more` : ''}</div></div>
              {isAdmin && <button className="btn primary sm" onClick={() => setAdding({ code: '', label: '' })}>Add value</button>}
            </div>
            <table className="table" style={{ marginTop: 10 }}>
              <thead><tr><th>Code</th><th>Label</th><th>Order</th><th>Status</th>{isAdmin && <th />}</tr></thead>
              <tbody>{(v?.values || []).map((y) => (
                <tr key={y.code}><td className="mono">{y.code}</td><td>{y.label}</td><td>{y.sortOrder}</td><td><span className={`pill ${y.isActive ? 'ok' : 'na'}`}>{y.isActive ? 'Active' : 'Retired'}</span></td>
                  {isAdmin && <td style={{ textAlign: 'right' }}><button className="btn xs" onClick={() => toggle(y.code)}>{y.isActive ? 'Retire' : 'Reactivate'}</button></td>}</tr>
              ))}</tbody>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>Retiring a value hides it from new captures. Existing observations keep it, so history never changes underneath a report.</div>
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <input className="field-input" style={{ maxWidth: 360, minHeight: 40, fontSize: 14 }} placeholder="Search by label, code or domain" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalog" />
            <div className="small muted">{catalog.coreFieldCount} core + {catalog.extensionFieldCount} extension fields · catalog v{catalog.catalogVersion}, generated {fmtDateTime(catalog.generatedAt)}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Field</th><th>Domain</th><th>Type</th><th>Unit</th><th>Vocabulary</th><th>Required</th><th>N/A</th><th>Shown when</th><th>Scope</th><th>URS</th></tr></thead>
              <tbody>{fields.map((f) => (
                <tr key={f.fieldCode} style={{ borderLeft: `4px solid var(--d-${f.domainCode})` }}>
                  <td><b>{f.label}</b><div className="small mono muted">{f.fieldCode}</div></td><td>{catalog.domains.find((d) => d.domainCode === f.domainCode)?.shortName}</td><td>{f.dataType}</td><td>{f.unit || ''}</td><td className="small mono">{f.vocabularyCode || ''}</td>
                  <td>{f.requiredDefault ? 'Yes' : 'No'}</td><td>{f.allowNA ? 'Allowed' : ''}</td><td className="small">{f.dependsOnField ? `${f.dependsOnField} = ${(f.dependsOnValues || []).join(' | ')}` : 'Always'}</td>
                  <td><span className={`badge ${f.taxonomyGroup === 'EXT' ? 'ext' : f.mvpScope === 'MVP' ? 'mvp' : ''}`}>{f.taxonomyGroup === 'EXT' ? 'Extension' : f.mvpScope === 'MVP' ? 'MVP' : 'Schema-ready'}</span></td><td className="small">{f.sourceReq}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>The catalog is the single source of truth: <span className="mono">backend/schema/field_catalog.csv</span> generates the Blob JSON Schemas, the curated dataset definitions, the Power Query layer for Power BI and this screen. Add a field there and everything regenerates in one run.</div>
        </div>
      )}

      {tab === 'reference' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <div><h2 style={{ margin: 0 }}>Reference data</h2><div className="small muted">Projects, ARs, trials, variants, samples and plans (NESTMS) as stored in the <span className="mono">reference</span> container. The capture screen only offers what is listed here.</div></div>
            {isAdmin && <><button className="btn primary sm" disabled={importing} onClick={() => refFile.current?.click()}>{importing ? 'Importing…' : 'Import bundle (JSON)'}</button><input ref={refFile} type="file" hidden accept="application/json,.json" onChange={(e) => { if (e.target.files[0]) importReference(e.target.files[0]); e.target.value = ''; }} /></>}
          </div>
          {!refStatus ? <div className="muted">Loading…</div> : (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className={`pill ${refStatus.source === 'DEMO_SEED' ? 'watch' : 'ok'}`}>{refStatus.source === 'DEMO_SEED' ? 'Demo seed data' : `Source: ${refStatus.source}`}</span>
                <span className="small muted">Updated {fmtDateTime(refStatus.updatedAt)} by {refStatus.updatedBy}{refStatus.exportedAt ? ` · exported ${fmtDateTime(refStatus.exportedAt)}` : ''}</span>
              </div>
              <table className="table">
                <thead><tr><th>Entity</th><th>Rows</th><th>Blob</th></tr></thead>
                <tbody>{Object.entries(refStatus.entities).map(([k, v]) => <tr key={k}><td>{({ ars: 'Stability ARs' })[k] || k.replace(/^./, (c) => c.toUpperCase())}</td><td>{v.count}</td><td className="mono small">{v.blob}</td></tr>)}</tbody>
              </table>
              <div className="hint" style={{ marginTop: 10 }}>Two ways to refresh: upload a bundle here (validated against <span className="mono">reference_bundle.schema.json</span>, parent/child integrity checked, written entity by entity with the manifest last), or run <span className="mono">npm run import-reference</span> in the API against the NESTMS export folder on a schedule. Lab results are typed into the questionnaire (no LIMS integration). Either way the whole set is replaced atomically from the app's point of view and the change is audited.</div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="row spread" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Audit trail</h2><span className="small muted">Who did what, when, to which record and version (R-31, R-32). Append-only.</span></div>
          {!audit.length ? <Empty title="No audit events yet">Events appear as observations are submitted, reviewed or configuration changes.</Empty> : (
            <table className="table">
              <thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Id</th><th>Version</th><th>Correlation</th></tr></thead>
              <tbody>{audit.map((a) => <tr key={a.auditId}><td>{fmtDateTime(a.eventTime)}</td><td>{a.actorName}</td><td>{a.actorRole}</td><td><span className={`pill ${a.action === 'CREATE' ? 'teal' : a.action === 'REVIEW' ? 'ok' : a.action === 'REJECT' ? 'fail' : ''}`}>{a.action.replace('_', ' ').toLowerCase()}</span></td><td>{a.entityType.replace('_', ' ').toLowerCase()}</td><td className="mono small">{a.entityId}</td><td>{a.entityVersion ?? ''}</td><td className="mono small">{a.correlationId}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Users and roles</h2><span className="small muted">Roles are Entra ID app roles (Stability.Scientist, Stability.Reviewer, Stability.Admin) assigned in the tenant. {DEMO_MODE ? 'Demo personas shown.' : ''}</span></div>
          <table className="table">
            <thead><tr><th>Name</th><th>Sign-in</th><th>Title</th><th>Role</th><th>Can capture</th><th>Can review</th><th>Can configure</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.userId}><td>{u.displayName}</td><td className="small">{u.upn}</td><td>{u.title}</td><td><span className="pill teal">{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</span></td><td>Yes</td><td>{u.role !== 'SCIENTIST' ? 'Yes' : ''}</td><td>{u.role === 'ADMIN' ? 'Yes' : ''}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {adding && (
        <Modal title={`Add a value to ${v?.name}`} onClose={() => setAdding(null)} footer={<><button className="btn" onClick={() => setAdding(null)}>Cancel</button><button className="btn primary" onClick={addValue}>Add value</button></>}>
          <div className="stack">
            <div><label className="lbl">Label shown to scientists</label><input className="field-input" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value, code: adding.codeTouched ? adding.code : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') })} autoFocus /></div>
            <div><label className="lbl">Stored code</label><input className="field-input mono" value={adding.code} onChange={(e) => setAdding({ ...adding, code: e.target.value, codeTouched: true })} /></div>
            <div className="small muted">The code is what lands in the stored records and in Power BI; the label can be reworded later without breaking history.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
