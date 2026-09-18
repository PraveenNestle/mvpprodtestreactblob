import React, { useRef } from 'react';
import { MediaCapture } from './MediaCapture.jsx';

const NA_REASONS = ['Gelled or too thick to pour', 'Not evaluated at this pull (shaken only)', 'Opaque bottle, cannot observe', 'Test not performed at this pull', 'Not applicable to this format', 'Sample unavailable or consumed', 'Study discontinued', 'Result not available'];

// Registers the focusable control so the parent can move focus to the next visible field on Enter (transcript: "enter, enter, enter, jumps down").
export function FieldRow({ field, entry, vocab, onChange, onNext, required, isBranch, hasProblem, register, readOnly, context, suggestion }) {
  const ref = useRef(null);
  const value = entry?.value;
  const isNA = !!entry?.isNA;
  const set = (patch) => onChange(field.fieldCode, { value: value ?? null, isNA, naReason: entry?.naReason ?? null, ...patch });
  const setRef = (el) => { ref.current = el; register?.(field.fieldCode, el); };
  const keyNext = (e) => { if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA' && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); onNext?.(field.fieldCode); } };

  const control = () => {
    const disabled = isNA || readOnly;
    if (readOnly) return <div className="ctx-readonly" ref={setRef}>{context?.[field.fieldCode] ?? <span className="muted">System-managed</span>}</div>;
    switch (field.dataType) {
      case 'ref':
        return <div className="ctx-readonly" ref={setRef}>{context?.[field.fieldCode] ?? <span className="muted">From the reference data</span>}</div>;
      case 'boolean':
        return (
          <div className="seg" role="group" aria-label={field.label}>
            <button ref={setRef} type="button" className="yes" aria-pressed={value === true} disabled={disabled} onClick={() => { set({ value: true }); onNext?.(field.fieldCode); }} onKeyDown={keyNext}>Yes</button>
            <button type="button" aria-pressed={value === false} disabled={disabled} onClick={() => { set({ value: false }); onNext?.(field.fieldCode); }} onKeyDown={keyNext}>No</button>
          </div>
        );
      case 'select':
      case 'code': {
        const opts = (vocab?.values || []).filter((v) => v.isActive || v.code === value);
        // Short vocabularies read faster as tap chips than as a dropdown on a tablet
        if (opts.length <= 5) {
          return (
            <div className="chips" role="group" aria-label={field.label}>
              {opts.map((o, i) => <button key={o.code} ref={i === 0 ? setRef : undefined} type="button" className="chip" aria-pressed={value === o.code} disabled={disabled} onClick={() => { set({ value: o.code }); onNext?.(field.fieldCode); }} onKeyDown={keyNext}>{o.label}</button>)}
            </div>
          );
        }
        return (
          <select ref={setRef} className="select" value={value ?? ''} disabled={disabled} onChange={(e) => set({ value: e.target.value || null })} onKeyDown={keyNext} aria-label={field.label}>
            <option value="">Choose</option>
            {opts.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        );
      }
      case 'multiselect': {
        const arr = Array.isArray(value) ? value : [];
        return (
          <div className="chips" role="group" aria-label={field.label}>
            {(vocab?.values || []).filter((v) => v.isActive).map((o, i) => (
              <button key={o.code} ref={i === 0 ? setRef : undefined} type="button" className="chip" aria-pressed={arr.includes(o.code)} disabled={disabled}
                onClick={() => set({ value: arr.includes(o.code) ? arr.filter((x) => x !== o.code) : [...arr, o.code] })} onKeyDown={keyNext}>{o.label}</button>
            ))}
          </div>
        );
      }
      case 'number':
      case 'percent':
      case 'integer':
        return (
          <div className="input-unit">
            <input ref={setRef} className="field-input" type="number" inputMode="decimal" step={field.dataType === 'integer' ? 1 : 'any'} min={field.dataType === 'percent' ? 0 : undefined} max={field.dataType === 'percent' ? 100 : undefined}
              value={value ?? ''} disabled={disabled} placeholder={isNA ? 'Not applicable' : 'Enter value'} aria-label={field.label}
              onChange={(e) => set({ value: e.target.value === '' ? null : Number(e.target.value) })} onKeyDown={keyNext} />
            {field.unit && <span className="unit">{field.unit}</span>}
          </div>
        );
      case 'text':
        return <input ref={setRef} className="field-input" type="text" value={value ?? ''} disabled={disabled} aria-label={field.label} onChange={(e) => set({ value: e.target.value })} onKeyDown={keyNext} />;
      case 'longtext':
        return <textarea ref={setRef} className="field-input" rows={2} value={value ?? ''} disabled={disabled} aria-label={field.label} placeholder="Notes that add to the structured descriptors" onChange={(e) => set({ value: e.target.value })} onKeyDown={keyNext} />;
      case 'datetime':
        return <input ref={setRef} className="field-input" type="datetime-local" value={value ? String(value).slice(0, 16) : ''} disabled={disabled} aria-label={field.label} onChange={(e) => set({ value: e.target.value ? new Date(e.target.value).toISOString() : null })} onKeyDown={keyNext} />;
      case 'media_photo':
      case 'media_video':
        return <MediaCapture field={field} items={Array.isArray(value) ? value : []} onChange={(items) => set({ value: items })} context={context} readOnly={readOnly} registerRef={setRef} />;
      case 'guidance':
        return (
          <div className="guidance">
            <span aria-hidden="true">⚠</span>
            <div>{field.description}</div>
            <button ref={setRef} type="button" className={`btn xs ack ${value ? 'primary' : ''}`} onClick={() => { set({ value: !value }); onNext?.(field.fieldCode); }} onKeyDown={keyNext}>{value ? 'Acknowledged' : 'Acknowledge'}</button>
          </div>
        );
      default:
        return <input ref={setRef} className="field-input" value={value ?? ''} onChange={(e) => set({ value: e.target.value })} />;
    }
  };

  return (
    <div className={`frow ${isNA ? 'is-na' : ''} ${isBranch ? 'is-branch' : ''} ${hasProblem ? 'has-problem' : ''}`} style={{ '--stripe': `var(--d-${field.domainCode})` }} id={`field-${field.fieldCode}`}>
      <div className="flabel">
        <div className="name">{field.label}{required && !isNA && <span className="req" aria-label="required">*</span>}</div>
        {field.dataType !== 'guidance' && field.description && <div className="desc">{field.description}</div>}
        {field.subDomain && field.subDomain !== 'GENERAL' && field.subDomain !== 'CONTEXT' && <div className="sub">{field.subDomain.charAt(0) + field.subDomain.slice(1).toLowerCase()}</div>}
      </div>
      <div className="fcontrol">
        {control()}
        {suggestion && !isNA && (
          <div className="suggest">
            {String(value) === String(suggestion.rating)
              ? <span>SOP suggestion applied: <b>{suggestion.rating}</b> from {suggestion.basis}. Change it if the bottle says otherwise.</span>
              : <><span>SOP suggests <b>{suggestion.rating}</b> from {suggestion.basis}.</span><button type="button" className="btn xs" onClick={() => set({ value: suggestion.rating })}>Apply {suggestion.rating}</button></>}
          </div>
        )}
      </div>
      <div className="fna">
        {field.allowNA && (
          <>
            <button type="button" className="na-pill" aria-pressed={isNA} disabled={readOnly} title="Mark this field as not applicable (replaces the 9999 placeholder)" onClick={() => set({ isNA: !isNA, value: !isNA ? null : value, naReason: !isNA ? NA_REASONS[0] : null })}>N/A</button>
            {isNA && (
              <select className="select na-reason" value={entry?.naReason || NA_REASONS[0]} disabled={readOnly} onChange={(e) => set({ naReason: e.target.value })} aria-label="Reason not applicable">
                {NA_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </>
        )}
      </div>
    </div>
  );
}
