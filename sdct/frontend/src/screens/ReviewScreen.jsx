import React, { useEffect, useMemo, useState } from 'react';
import { api, toCsv } from '../api/index.js';
import { ObservationDetail } from '../components/ObservationDetail.jsx';
import { ResultPill, StatusPill, useToast, Empty } from '../components/ui.jsx';
import { can } from '../auth/auth.js';
import { fmtDate } from '../lib/format.js';

const TP_ORDER = ['T0', '1D', '1W', '2W', '1M', '2M', '3M', '4M', '6M', '9M', '12M', '15M', '18M'];
const COND_ORDER = ['4C', '25C', '30C', '35C', '45C', '55C', 'FRZ'];
const rating = (o, code) => { const v = o.values.find((x) => x.fieldCode === code); return !v ? '' : v.isNA ? 'N/A' : v.value ?? ''; };
const ratingTone = (o) => { const rs = ['cream_unsh_rating', 'serum_unsh_rating', 'sed_unsh_rating', 'cream_sh_rating', 'serum_sh_rating', 'sed_sh_rating'].map((c) => Number(rating(o, c))).filter((n) => !Number.isNaN(n)); const m = rs.length ? Math.max(...rs) : null; return m === null ? '' : m >= 4 ? 'fail' : m >= 2 ? 'watch' : 'ok'; };

const DEFECT_FLAGS = [
  ['HOMOG', 'homog_unshaken_homogeneous', 'Not homogeneous', true], ['CREAMING', 'cream_unsh_present', 'Creaming', false], ['SERUM', 'serum_unsh_present', 'Serum', false],
  ['SEDIMENT', 'sed_unsh_present', 'Sediment', false], ['GELLING', 'gel_gelled', 'Gelling', false], ['NON_HOMOG', 'nh_lumps_present', 'Lumps', false], ['PROTEIN_SAG', 'psag_vertical_stripes_present', 'Sagging', false],
];

export function ReviewScreen({ catalog, user, focusId, onOpenCapture }) {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [projects, setProjects] = useState([]);
  const [f, setF] = useState({ projectCode: '', arNumber: '', trialNumber: '', status: '', timePointCode: '', conditionCode: '', defect: '' });
  const [selectedId, setSelectedId] = useState(focusId || null);
  const [view, setView] = useState('timeline');
  const vocabIndex = useMemo(() => Object.fromEntries(catalog.vocabularies.map((v) => [v.code, Object.fromEntries(v.values.map((x) => [x.code, x.label]))])), [catalog]);

  const load = () => api.listObservations({ projectCode: f.projectCode, arNumber: f.arNumber, trialNumber: f.trialNumber, status: f.status }).then(setRows);
  useEffect(() => { api.getProjects().then(setProjects); }, []);
  useEffect(() => { load(); }, [f.projectCode, f.arNumber, f.trialNumber, f.status]);

  const flagsOf = (o) => DEFECT_FLAGS.map(([dom, code, label, inverted]) => { const v = o.values.find((x) => x.fieldCode === code); if (!v || v.isNA) return null; const on = inverted ? v.value === false : v.value === true; return { dom, label, on }; }).filter(Boolean);
  const filtered = rows.filter((o) => (!f.timePointCode || o.context.timePointCode === f.timePointCode) && (!f.conditionCode || o.context.conditionCode === f.conditionCode) && (!f.defect || flagsOf(o).some((x) => x.dom === f.defect && x.on)));
  const selected = rows.find((o) => o.observationId === selectedId) || null;
  const ars = [...new Set(rows.map((o) => o.context.arNumber))];
  const trials = [...new Set(rows.filter((o) => !f.arNumber || o.context.arNumber === f.arNumber).map((o) => o.context.trialNumber))];

  const review = async (obs, action) => {
    const note = action === 'REJECT' ? window.prompt('Reason for rejection (recorded in the audit trail):') : null;
    if (action === 'REJECT' && note === null) return;
    try { await api.reviewObservation(obs.observationId, action, user, note); toast(action === 'REJECT' ? 'Observation rejected' : 'Observation marked reviewed', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const exportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `stability_observations_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    toast(`Exported ${filtered.length} observations (${csv.split('\n').length - 1} rows)`, 'ok');
  };

  const byDay = useMemo(() => { const m = new Map(); filtered.forEach((o) => { const d = fmtDate(o.observedAt, { weekday: 'short' }); if (!m.has(d)) m.set(d, []); m.get(d).push(o); }); return [...m.entries()]; }, [filtered]);

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <div><h1>Review observations</h1><div className="muted small">Every observation for the selected project, AR or trial, newest first. Open one to see all descriptors, media and its version history.</div></div>
          <div className="row">
            <div className="seg" role="group" aria-label="View"><button aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button><button aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>Rating matrix</button></div>
            {can(user, 'export') && <button className="btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV ({filtered.length})</button>}
          </div>
        </div>
        <div className="context-bar" style={{ marginTop: 12 }}>
          <Sel label="Project" value={f.projectCode} onChange={(v) => setF({ ...f, projectCode: v, arNumber: '', trialNumber: '' })} options={projects.map((p) => [p.projectCode, `${p.projectCode}  ${p.projectName}`])} />
          <Sel label="Stability AR" value={f.arNumber} onChange={(v) => setF({ ...f, arNumber: v, trialNumber: '' })} options={ars.map((a) => [a, a])} />
          <Sel label="Trial" value={f.trialNumber} onChange={(v) => setF({ ...f, trialNumber: v })} options={trials.map((t) => [t, t])} />
          <Sel label="Time point" value={f.timePointCode} onChange={(v) => setF({ ...f, timePointCode: v })} options={catalog.vocabularies.find((v) => v.code === 'TIME_POINT').values.map((x) => [x.code, x.label])} />
          <Sel label="Condition" value={f.conditionCode} onChange={(v) => setF({ ...f, conditionCode: v })} options={catalog.vocabularies.find((v) => v.code === 'TEMP_CONDITION').values.map((x) => [x.code, x.label])} />
          <Sel label="Defect present" value={f.defect} onChange={(v) => setF({ ...f, defect: v })} options={DEFECT_FLAGS.map(([d, , l]) => [d, l])} />
          <Sel label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['SUBMITTED', 'Submitted'], ['REVIEWED', 'Reviewed'], ['REJECTED', 'Rejected']]} />
        </div>
      </div>

      <div className="grid-2">
        <div>
          {!filtered.length && <div className="card"><Empty title="No observations match">Widen the filters, or capture the first observation for this trial.</Empty></div>}
          {view === 'matrix' && <RatingMatrix rows={filtered} selectedId={selectedId} onSelect={setSelectedId} condLabels={vocabIndex.TEMP_CONDITION} />}
          {view === 'timeline' ? byDay.map(([day, list]) => (
            <div key={day}>
              <div className="tl-day">{day}</div>
              {list.map((o) => (
                <div key={o.observationId} className={`tl-item ${selectedId === o.observationId ? 'selected' : ''}`} onClick={() => setSelectedId(o.observationId)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedId(o.observationId)}>
                  <div className="tl-time">{new Date(o.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<br /><span className="pill teal" style={{ marginTop: 4 }}>{o.context.timePointCode}</span></div>
                  <div className="tl-main">
                    <div className="title">{o.context.sampleCode} <span className="muted small">· {vocabIndex.TEMP_CONDITION[o.context.conditionCode]}</span></div>
                    <div className="sub">{o.context.projectCode} · {o.context.arNumber} · {o.context.trialNumber} · {o.context.variantNumber} · {o.observer.displayName} · {o.media?.length || 0} media</div>
                    <div className="tl-flags">{flagsOf(o).map((x) => <span key={x.dom} className={`flag ${x.on ? 'on' : ''}`} style={{ '--stripe': `var(--d-${x.dom})`, '--stripe-soft': 'var(--panel-2)' }}>{x.label}{x.on ? '' : ': no'}</span>)}</div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><ResultPill result={o.overallResult} na={o.overallResultNA} /><StatusPill status={o.status} /></div>
                </div>
              ))}
            </div>
          )) : view === 'table' ? (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Observed</th><th>Sample</th><th>AR / Trial / Variant</th><th>TP</th><th>Cond.</th><th>Defects</th><th>Result</th><th>Status</th><th>Media</th><th>Observer</th></tr></thead>
                <tbody>{filtered.map((o) => (
                  <tr key={o.observationId} className={`clickable ${selectedId === o.observationId ? 'selected' : ''}`} onClick={() => setSelectedId(o.observationId)}>
                    <td>{fmtDate(o.observedAt)}</td><td className="mono">{o.context.sampleCode}</td><td>{o.context.arNumber} · {o.context.trialNumber} · {o.context.variantNumber}</td><td>{o.context.timePointCode}</td><td>{o.context.conditionCode}</td>
                    <td>{flagsOf(o).filter((x) => x.on).map((x) => x.label).join(', ') || 'None'}</td><td><ResultPill result={o.overallResult} na={o.overallResultNA} /></td><td><StatusPill status={o.status} /></td><td>{o.media?.length || 0}</td><td>{o.observer.displayName}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div>
          {selected ? <ObservationDetail obs={selected} catalog={catalog} vocabIndex={vocabIndex} canReview={can(user, 'review')} onReview={review} />
            : <div className="card quiet"><Empty title="Select an observation">The full descriptor set, media files and version history appear here.</Empty></div>}
          {selected && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => onOpenCapture?.({ projectCode: selected.context.projectCode, arNumber: selected.context.arNumber, trialNumber: selected.context.trialNumber, variantId: selected.context.variantId, variantNumber: selected.context.variantNumber })}>Capture next pull for this trial</button>}
        </div>
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return (<div className="ctx"><span className="lbl">{label}</span><select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}><option value="">All</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>);
}


// The team's spreadsheet as a live view: rows are time point × storage condition, columns are variants, each cell holds the six SOP ratings
// (creaming, serum, sediment; unshaken / shaken). One AR (or trial) at a time; pick it in the filters.
function RatingMatrix({ rows, selectedId, onSelect, condLabels }) {
  const ars = [...new Set(rows.map((o) => o.context.arNumber))];
  if (ars.length !== 1) return <div className="card"><Empty title="Pick one stability AR">The rating matrix shows one AR at a time, the way the stability spreadsheet does. Choose an AR in the filters above.</Empty></div>;
  const variants = [...new Set(rows.map((o) => `${o.context.trialNumber} · ${o.context.variantNumber}`))].sort();
  const keys = [...new Set(rows.map((o) => `${o.context.timePointCode}|${o.context.conditionCode}`))].sort((a, b) => { const [ta, ca] = a.split('|'); const [tb, cb] = b.split('|'); return (TP_ORDER.indexOf(ta) - TP_ORDER.indexOf(tb)) || (COND_ORDER.indexOf(ca) - COND_ORDER.indexOf(cb)); });
  const cell = (k, v) => rows.find((o) => `${o.context.timePointCode}|${o.context.conditionCode}` === k && `${o.context.trialNumber} · ${o.context.variantNumber}` === v);
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="row spread" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{ars[0]}: SOP ratings by pull</h2><span className="small muted">Each cell: creaming · serum · sediment as unshaken / shaken (SOP-00000202 Tables 2 to 4). Tinted by the worst rating.</span></div>
      <table className="table matrix">
        <thead><tr><th>Time point</th><th>Condition</th>{variants.map((v) => <th key={v}>{v}</th>)}</tr></thead>
        <tbody>{keys.map((k) => { const [tp, cond] = k.split('|'); return (
          <tr key={k}><td><b>{tp}</b></td><td>{condLabels[cond] || cond}</td>
            {variants.map((v) => { const o = cell(k, v); if (!o) return <td key={v} className="mx-empty">·</td>; const tone = ratingTone(o); return (
              <td key={v} className={`mx ${tone} ${selectedId === o.observationId ? 'selected' : ''}`} onClick={() => onSelect(o.observationId)} title={`${o.context.sampleCode} · ${o.overallResult || ''}`}>
                <div className="mx-line"><span>C</span><b>{rating(o, 'cream_unsh_rating')}</b><i>/</i><b>{rating(o, 'cream_sh_rating')}</b></div>
                <div className="mx-line"><span>S</span><b>{rating(o, 'serum_unsh_rating')}</b><i>/</i><b>{rating(o, 'serum_sh_rating')}</b></div>
                <div className="mx-line"><span>Sd</span><b>{rating(o, 'sed_unsh_rating')}</b><i>/</i><b>{rating(o, 'sed_sh_rating')}</b>{rating(o, 'sed_unsh_height_value') !== '' && <small>{rating(o, 'sed_unsh_height_value')} mm</small>}</div>
              </td>
            ); })}
          </tr>
        ); })}</tbody>
      </table>
      <div className="small muted" style={{ marginTop: 8 }}>N/A means not evaluated (for example gelled or too thick to pour). Older sheets used 9999 for this.</div>
    </div>
  );
}
