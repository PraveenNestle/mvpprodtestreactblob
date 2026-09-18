import React, { useEffect, useMemo, useState } from 'react';
import { api, DEMO_MODE } from '../api/index.js';
import { ResultPill, StatusPill } from '../components/ui.jsx';
import { cellStatus } from '../components/PlanGrid.jsx';
import { plans as demoPlans, ars as demoArs, projects as demoProjects, dueDate } from '../api/demoData.js';
import { fmtDate } from '../lib/format.js';
import { queued } from '../lib/offlineQueue.js';

export function HomeScreen({ catalog, user, onCapture, onReview }) {
  const [obs, setObs] = useState([]);
  useEffect(() => { api.listObservations().then(setObs); }, []);
  const condLabels = useMemo(() => Object.fromEntries(catalog.vocabularies.find((v) => v.code === 'TEMP_CONDITION').values.map((v) => [v.code, v.label])), [catalog]);

  // Work list: plan cells that are due or overdue with nothing captured (mirrors V_STABILITY_PLAN_PROGRESS)
  const worklist = useMemo(() => {
    const items = [];
    demoPlans.forEach((p) => {
      const ar = demoArs.find((a) => a.arNumber === p.arNumber); const prj = demoProjects.find((x) => x.projectCode === ar.projectCode);
      const arObs = obs.filter((o) => o.context.arNumber === p.arNumber);
      p.timePoints.forEach((tp) => p.conditions.forEach((c) => { const st = cellStatus(p, tp, c, arObs); if (st === 'due' || st === 'overdue') items.push({ plan: p, ar, prj, tp, cond: c, status: st, due: dueDate(p, tp) }); }));
    });
    return items.sort((a, b) => (a.due < b.due ? -1 : 1));
  }, [obs]);

  const submitted = obs.filter((o) => o.status === 'SUBMITTED').length;
  const withDefect = obs.filter((o) => o.overallResult && o.overallResult !== 'IN').length;
  const media = obs.reduce((n, o) => n + (o.media?.length || 0), 0);
  const naCount = obs.reduce((n, o) => n + o.values.filter((v) => v.isNA).length, 0);
  const q = queued();
  const hour = new Date().getHours();

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {user.displayName.split(' ').pop()}</h1>
          <div className="muted">Bridgewater PDC stability program. {worklist.length ? `${worklist.length} pull${worklist.length === 1 ? '' : 's'} due or overdue across ${new Set(worklist.map((w) => w.ar.arNumber)).size} ARs.` : 'Nothing is overdue.'} {q.length ? `${q.length} observation${q.length === 1 ? '' : 's'} waiting to sync.` : ''}</div>
        </div>
        <button className="btn primary" onClick={() => onCapture()}>Capture observation</button>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{obs.length}</b><span>Observations captured</span></div>
        <div className="kpi"><b>{submitted}</b><span>Awaiting review</span></div>
        <div className="kpi"><b>{obs.length ? Math.round((withDefect / obs.length) * 100) : 0}%</b><span>Just In or Out</span></div>
        <div className="kpi"><b>{media}</b><span>Media files, all standard-named</span></div>
        <div className="kpi"><b>{naCount}</b><span>Explicit N/A entries (no 9999)</span></div>
        <div className="kpi"><b>{worklist.filter((w) => w.status === 'overdue').length}</b><span>Overdue pulls</span></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="row spread"><h2>Due and overdue pulls</h2><span className="small muted">From the AR stability plans (read-only)</span></div>
          {!worklist.length ? <div className="muted">All planned pulls to date are captured.</div> : (
            <table className="table">
              <thead><tr><th>Due</th><th>Project</th><th>AR</th><th>Time point</th><th>Condition</th><th>Status</th><th /></tr></thead>
              <tbody>{worklist.slice(0, 14).map((w, i) => (
                <tr key={i}>
                  <td>{fmtDate(w.due)}</td><td className="small">{w.prj.projectCode}<div className="muted">{w.prj.projectName}</div></td><td>{w.ar.arNumber}</td><td>{w.tp}</td><td>{condLabels[w.cond]}</td>
                  <td><span className={`pill ${w.status === 'overdue' ? 'fail' : 'watch'}`}>{w.status === 'overdue' ? 'Overdue' : 'Due this week'}</span></td>
                  <td style={{ textAlign: 'right' }}><button className="btn xs" onClick={() => onCapture({ projectCode: w.prj.projectCode, arNumber: w.ar.arNumber, timePointCode: w.tp, conditionCode: w.cond })}>Capture</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {worklist.length > 14 && <div className="small muted" style={{ marginTop: 8 }}>{worklist.length - 14} more in the plan grids.</div>}
        </div>
        <div className="stack">
          <div className="card">
            <div className="row spread"><h2>Recent observations</h2><button className="btn link" onClick={() => onReview()}>Review all</button></div>
            <div className="stack" style={{ gap: 8 }}>
              {obs.slice(0, 6).map((o) => (
                <div key={o.observationId} className="row spread" style={{ cursor: 'pointer' }} onClick={() => onReview(o.observationId)} role="button" tabIndex={0}>
                  <div><b className="small">{o.context.sampleCode}</b><div className="small muted">{o.context.timePointCode} · {condLabels[o.context.conditionCode]} · {fmtDate(o.observedAt)} · {o.observer.displayName}</div></div>
                  <div className="row" style={{ gap: 6 }}><ResultPill result={o.overallResult} na={o.overallResultNA} /><StatusPill status={o.status} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card quiet">
            <h3>How the data flows</h3>
            <div className="small muted">Everything lives in one Azure Storage account. Context comes from <span className="mono">reference/</span> (NESTMS export; pH and viscosity are typed in from LIMS) → media is uploaded with its standard filename to <span className="mono">media/</span> → the observation JSON is written to <span className="mono">observations/</span> (versioned) → flat rows are appended to <span className="mono">curated/</span> → Power BI reads those folders directly. {DEMO_MODE ? 'This demo runs entirely in the browser with seeded data.' : ''}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
