import React from 'react';
import { ResultPill, StatusPill } from './ui.jsx';
import { fmtDateTime, fmtBytes } from '../lib/format.js';

export function ObservationDetail({ obs, catalog, vocabIndex, onReview, canReview }) {
  if (!obs) return null;
  const fieldIndex = Object.fromEntries(catalog.fields.map((f) => [f.fieldCode, f]));
  const domains = catalog.domains.filter((d) => obs.values.some((v) => v.domainCode === d.domainCode));
  const fmt = (v, f) => {
    if (v.isNA) return null;
    if (v.value === null || v.value === undefined || v.value === '') return '';
    if (f.dataType === 'boolean') return v.value ? 'Yes' : 'No';
    if (f.dataType === 'guidance') return v.value ? 'Acknowledged' : 'Shown';
    if (f.dataType === 'multiselect') return v.value.map((c) => vocabIndex[f.vocabularyCode]?.[c] || c).join(', ');
    if (f.dataType === 'select' || f.dataType === 'code') return vocabIndex[f.vocabularyCode]?.[v.value] || v.value;
    if (f.dataType.startsWith('media')) return `${Array.isArray(v.value) ? v.value.length : 1} file`;
    if (f.dataType === 'datetime') return fmtDateTime(v.value);
    return `${v.value}${v.unit ? ` ${v.unit}` : ''}`;
  };
  const c = obs.context;
  return (
    <div className="card detail">
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{c.sampleCode}</h2>
          <div className="small muted">{c.projectCode} · {c.arNumber} · {c.trialNumber} · {c.variantNumber}</div>
        </div>
        <StatusPill status={obs.status} />
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        <span className="pill teal">{c.timePointCode}</span>
        <span className="pill teal">{vocabIndex.TEMP_CONDITION?.[c.conditionCode] || c.conditionCode}</span>
        <ResultPill result={obs.overallResult} na={obs.overallResultNA} />
      </div>
      <div className="kv">
        <span className="k">Observed</span><span className="v">{fmtDateTime(obs.observedAt)}</span>
        <span className="k">Observer</span><span className="v">{obs.observer.displayName}</span>
        <span className="k">Template</span><span className="v">{obs.template.templateName} v{obs.template.templateVersion}</span>
        <span className="k">Version</span><span className="v">v{obs.versionNo}{obs.audit?.previousVersionUri ? ' (supersedes earlier)' : ''}</span>
        {obs.reviewedBy && <><span className="k">Reviewed</span><span className="v">{fmtDateTime(obs.reviewedAt)}</span></>}
        {obs.storage?.blobPath && <><span className="k">Landed at</span><span className="v mono small">observations/{obs.storage.blobPath}</span></>}
      </div>
      {canReview && obs.status === 'SUBMITTED' && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm primary" onClick={() => onReview(obs, 'REVIEW')}>Mark reviewed</button>
          <button className="btn sm danger" onClick={() => onReview(obs, 'REJECT')}>Reject</button>
        </div>
      )}
      {domains.map((d) => {
        const vals = obs.values.filter((v) => v.domainCode === d.domainCode && fieldIndex[v.fieldCode]);
        return (
          <div key={d.domainCode} className="dom-block" style={{ '--stripe': `var(--d-${d.domainCode})` }}>
            <h3>{d.name}</h3>
            <div className="kv">
              {vals.map((v) => {
                const f = fieldIndex[v.fieldCode];
                const text = fmt(v, f);
                if (text === '') return null;
                return <React.Fragment key={v.fieldCode}><span className="k">{f.label}</span><span className={`v ${v.isNA ? 'na' : ''}`}>{v.isNA ? `N/A (${v.naReason || 'no reason'})` : text}</span></React.Fragment>;
              })}
            </div>
          </div>
        );
      })}
      {obs.media?.length > 0 && (
        <div className="dom-block" style={{ '--stripe': 'var(--d-GENERAL_MEDIA)' }}>
          <h3>Media ({obs.media.length})</h3>
          <div className="media-tray">
            {obs.media.map((m) => (
              <div key={m.mediaAssetId} className="thumb" title={m.standardFilename}>
                {m.previewUrl ? (m.mediaType === 'VIDEO' ? <video src={m.previewUrl} muted /> : <img src={m.previewUrl} alt={fieldIndex[m.fieldCode]?.label || m.fieldCode} />) : <div className="ph">{fieldIndex[m.fieldCode]?.label || m.fieldCode}</div>}
                <span className="tag">{m.mediaType === 'VIDEO' ? `${m.durationS ?? ''}s` : fmtBytes(m.sizeBytes)}</span>
              </div>
            ))}
          </div>
          <div className="fname" style={{ marginTop: 6 }}>{obs.media.map((m) => <div key={m.mediaAssetId}>{m.standardFilename}</div>)}</div>
        </div>
      )}
    </div>
  );
}
