import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, DEMO_MODE } from '../api/index.js';
import { FieldRow } from '../components/FieldRow.jsx';
import { PlanGrid } from '../components/PlanGrid.jsx';
import { useToast, Modal } from '../components/ui.jsx';
import { isVisible } from '../lib/branching.js';
import { validateObservation, completeness, isRequired, isSystemField } from '../lib/validation.js';
import { saveDraft, loadDraft, clearDraft, enqueue } from '../lib/offlineQueue.js';
import { uuid } from '../lib/format.js';
import { observationBlobPath } from '../lib/naming.js';
import { suggestAll, RATING_FIELDS } from '../lib/ratings.js';

export function CaptureScreen({ catalog, user, online, initialContext, onSubmitted }) {
  const toast = useToast();
  const fieldIndex = useMemo(() => Object.fromEntries(catalog.fields.map((f) => [f.fieldCode, f])), [catalog]);
  const vocabIndex = useMemo(() => Object.fromEntries(catalog.vocabularies.map((v) => [v.code, v])), [catalog]);
  const condLabels = useMemo(() => Object.fromEntries((vocabIndex.TEMP_CONDITION?.values || []).map((v) => [v.code, v.label])), [vocabIndex]);

  const [projects, setProjects] = useState([]); const [ars, setArs] = useState([]); const [trials, setTrials] = useState([]);
  const [variants, setVariants] = useState([]); const [samples, setSamples] = useState([]); const [plan, setPlan] = useState(null);
  const [templates, setTemplates] = useState([]); const [existing, setExisting] = useState([]);
  const [ctx, setCtx] = useState({ projectCode: '', arNumber: '', trialNumber: '', variantId: '', variantNumber: '', sampleCode: '', timePointCode: '', conditionCode: '', formulationClass: '', ...(initialContext || {}) });
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState({});
  const [problems, setProblems] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [draftNotice, setDraftNotice] = useState(null);
  const focusables = useRef(new Map());
  const observationIdRef = useRef(uuid());

  // ---- reference data cascade (read-only from the reference container through the API; R-03, R-15, R-21)
  useEffect(() => { api.getProjects().then(setProjects); api.listTemplates().then((t) => setTemplates(t.filter((x) => x.status !== 'RETIRED'))); }, []);
  useEffect(() => { if (ctx.projectCode) api.getARs(ctx.projectCode).then(setArs); else setArs([]); }, [ctx.projectCode]);
  useEffect(() => { if (ctx.arNumber) { api.getTrials(ctx.arNumber).then(setTrials); api.getPlan(ctx.arNumber).then(setPlan); } else { setTrials([]); setPlan(null); } }, [ctx.arNumber]);
  useEffect(() => { if (ctx.arNumber && ctx.trialNumber) { api.getVariants(ctx.arNumber, ctx.trialNumber).then(setVariants); api.listObservations({ arNumber: ctx.arNumber, trialNumber: ctx.trialNumber }).then(setExisting); } else { setVariants([]); setExisting([]); } }, [ctx.arNumber, ctx.trialNumber]);
  useEffect(() => { if (ctx.variantId) api.getSamples(ctx.variantId).then(setSamples); else setSamples([]); }, [ctx.variantId]);

  const trial = trials.find((t) => t.trialNumber === ctx.trialNumber);
  const formulationClass = trial?.formulationClass || projects.find((p) => p.projectCode === ctx.projectCode)?.formulationClass || '';
  useEffect(() => { setCtx((c) => ({ ...c, formulationClass, planId: plan?.planId || null, planVersion: plan?.planVersion || null })); }, [formulationClass, plan]);
  const classTemplates = templates.filter((t) => !formulationClass || t.formulationClass === formulationClass);
  useEffect(() => { if (!classTemplates.some((t) => t.templateId === templateId)) setTemplateId(classTemplates.find((t) => t.status === 'ACTIVE')?.templateId || classTemplates[0]?.templateId || ''); }, [classTemplates, templateId]);
  const template = templates.filter((t) => t.templateId === templateId).sort((a, b) => b.version - a.version)[0];

  // ---- selection helpers
  const setCtxField = (k, v) => setCtx((c) => {
    const next = { ...c, [k]: v };
    if (k === 'projectCode') Object.assign(next, { arNumber: '', trialNumber: '', variantId: '', variantNumber: '', sampleCode: '', timePointCode: '', conditionCode: '' });
    if (k === 'arNumber') Object.assign(next, { trialNumber: '', variantId: '', variantNumber: '', sampleCode: '', timePointCode: '', conditionCode: '' });
    if (k === 'trialNumber') Object.assign(next, { variantId: '', variantNumber: '', sampleCode: '', conditionCode: '' });
    if (k === 'variantId') Object.assign(next, { variantNumber: variants.find((x) => x.variantId === v)?.variantNumber || '', sampleCode: '', conditionCode: '' });
    if (k === 'sampleCode') next.conditionCode = samples.find((s) => s.sampleCode === v)?.conditionCode || next.conditionCode;
    return next;
  });
  const contextComplete = ctx.projectCode && ctx.arNumber && ctx.trialNumber && ctx.sampleCode && ctx.timePointCode && ctx.conditionCode && template;
  const draftKey = `${ctx.arNumber}|${ctx.trialNumber}|${ctx.sampleCode}|${ctx.timePointCode}|${ctx.conditionCode}`;

  // ---- drafts (R-36): restore when the context is complete, autosave on every change
  useEffect(() => {
    if (!contextComplete) return;
    const d = loadDraft(draftKey);
    if (d && Object.keys(d.values || {}).length > 3) { setValues(d.values); observationIdRef.current = d.observationId || uuid(); setDraftNotice(d.savedAt); } else { setValues(freshValues()); observationIdRef.current = uuid(); setDraftNotice(null); }
  }, [draftKey, contextComplete]);
  useEffect(() => { if (contextComplete && Object.keys(values).length > 3) saveDraft(draftKey, { values: stripFiles(values), observationId: observationIdRef.current, context: ctx }); }, [values, draftKey, contextComplete]);

  // ---- ordered fields from template sections, with branching applied
  const sections = useMemo(() => (template?.sections || []).map((s) => ({ label: s.label, fields: s.fields.map((c) => fieldIndex[c]).filter(Boolean) })), [template, fieldIndex]);
  const orderedFields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
  const visibleOrdered = useMemo(() => orderedFields.filter((f) => isVisible(f, values, fieldIndex)), [orderedFields, values, fieldIndex]);
  const capturable = useMemo(() => orderedFields.filter((f) => !isSystemField(f)), [orderedFields]);
  const comp = completeness({ fields: capturable, fieldIndex, values, template });
  useEffect(() => { if (sections.length && !sections.some((s) => s.label === active)) setActive(sections[0]?.label); }, [sections, active]);

  const onChange = useCallback((code, entry) => setValues((v) => ({ ...v, [code]: entry })), []);
  const sampleRef = samples.find((s) => s.sampleCode === ctx.sampleCode);
  const suggestions = useMemo(() => suggestAll(values, sampleRef), [values, sampleRef]);
  const lastSuggested = useRef({});
  useEffect(() => {
    // SOP ratings follow the measurement until the scientist types a different rating by hand
    const patch = {};
    Object.keys(RATING_FIELDS).forEach((code) => {
      const s = suggestions[code]; const cur = values[code];
      if (!s) return;
      const untouched = !cur || cur.value === null || cur.value === undefined || cur.value === '' || String(cur.value) === String(lastSuggested.current[code]);
      if (untouched && !cur?.isNA && String(cur?.value) !== s.rating) patch[code] = { value: s.rating, isNA: false, naReason: null };
      lastSuggested.current[code] = s.rating;
    });
    if (Object.keys(patch).length) setValues((v) => ({ ...v, ...patch }));
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps
  const register = useCallback((code, el) => { if (el) focusables.current.set(code, el); else focusables.current.delete(code); }, []);
  const focusNext = useCallback((code) => {
    const list = visibleOrdered.filter((f) => !isSystemField(f));
    const i = list.findIndex((f) => f.fieldCode === code);
    for (let j = i + 1; j < list.length; j += 1) {
      const el = focusables.current.get(list[j].fieldCode);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const sec = sections.find((s) => s.fields.some((f) => f.fieldCode === list[j].fieldCode)); if (sec) setActive(sec.label); return; }
    }
  }, [visibleOrdered, sections]);

  // ---- build the observation document exactly as the API stores it (observation.schema.json)
  const buildDoc = (status) => {
    const now = new Date().toISOString();
    const media = [];
    const docValues = [];
    orderedFields.forEach((f) => {
      if (f.isHeader || isSystemField(f)) return; // header values are carried on the document header, not in values[]
      if (!isVisible(f, values, fieldIndex)) return;
      const e = values[f.fieldCode];
      if (!e || (e.value === null || e.value === undefined || e.value === '' || (Array.isArray(e.value) && !e.value.length)) && !e.isNA) return;
      if (f.dataType.startsWith('media')) {
        e.value.forEach((m) => media.push(sanitizeMedia(m, ctx)));
        docValues.push({ fieldCode: f.fieldCode, domainCode: f.domainCode, dataType: f.dataType, value: e.value.map((m) => m.mediaAssetId), unit: null, isNA: false, naReason: null, mediaAssetId: e.value[0]?.mediaAssetId || null });
        return;
      }
      docValues.push({ fieldCode: f.fieldCode, domainCode: f.domainCode, dataType: f.dataType, value: e.isNA ? null : e.value, unit: f.unit || null, isNA: !!e.isNA, naReason: e.isNA ? e.naReason || null : null, mediaAssetId: null });
    });
    const overall = values.overall_result;
    return {
      schemaVersion: '1.0', observationId: observationIdRef.current, versionNo: 1, status,
      context: { projectCode: ctx.projectCode, arNumber: ctx.arNumber, trialNumber: ctx.trialNumber, variantId: ctx.variantId || null, variantNumber: ctx.variantNumber || null, sampleCode: ctx.sampleCode, timePointCode: ctx.timePointCode, conditionCode: ctx.conditionCode, formulationClass: ctx.formulationClass, planId: plan?.planId || null, planVersion: plan?.planVersion || null, sourceSystem: 'REFERENCE_STORE' },
      template: { templateId: template.templateId, templateVersion: template.version, templateName: template.templateName },
      resultType: values.result_type?.value || 'SCHEDULED', overallResult: overall?.isNA ? null : overall?.value || null, overallResultNA: !!overall?.isNA,
      observer: { userId: user.userId, displayName: user.displayName, upn: user.upn, role: user.role },
      observedAt: values.observation_timestamp?.value || now, submittedAt: status === 'DRAFT' ? null : now,
      device: { userAgent: navigator.userAgent, platform: navigator.platform || 'unknown', online },
      values: docValues, media,
      audit: { createdBy: user.userId, createdAt: now, correlationId: `corr-${uuid().slice(0, 12)}`, previousVersionUri: null },
    };
  };

  const submit = async () => {
    const probs = validateObservation({ fields: capturable, fieldIndex, values, template, context: ctx });
    setProblems(probs);
    if (probs.length) { toast(`${probs.length} item${probs.length > 1 ? 's' : ''} need attention before submitting`, 'err'); return; }
    setConfirm(buildDoc('SUBMITTED'));
  };
  const confirmSubmit = async () => {
    const doc = confirm; setConfirm(null); setBusy(true);
    const files = Object.values(values).flatMap((e) => (Array.isArray(e?.value) && e.value[0]?.mediaAssetId ? e.value.filter((m) => m.file) : []));
    try {
      if (!online) throw new Error('offline');
      const res = await api.submitObservation(doc, files);
      clearDraft(draftKey); setValues(freshValues()); setProblems([]); observationIdRef.current = uuid();
      setExisting((e) => [{ ...doc, storage: { blobPath: res.blobPath } }, ...e]);
      toast(`Submitted ${doc.context.sampleCode} at ${doc.context.timePointCode}. ${files.length} media file${files.length === 1 ? '' : 's'} named to the standard.`, 'ok');
      onSubmitted?.(doc);
    } catch (err) {
      if (!online || /offline|Failed to fetch|NetworkError/i.test(err.message)) {
        enqueue({ id: doc.observationId, doc, mediaCount: files.length });
        toast('No connection. The observation is queued on this device and will be sent when the network is back.', 'info', 5000);
      } else toast(`Submit failed: ${err.message}`, 'err', 6000);
    } finally { setBusy(false); }
  };

  const secStatus = (s) => {
    const req = s.fields.filter((f) => !isSystemField(f) && isVisible(f, values, fieldIndex) && isRequired(f, template));
    const done = req.filter((f) => { const e = values[f.fieldCode]; return (e?.isNA && f.allowNA) || (e?.value !== undefined && e?.value !== null && e?.value !== '' && !(Array.isArray(e.value) && !e.value.length)); }).length;
    return { req: req.length, done };
  };
  const domainOf = (s) => s.fields[0]?.domainCode || 'TEST_CONTEXT';
  const problemSet = new Set(problems.map((p) => p.fieldCode));
  const sample = samples.find((s) => s.sampleCode === ctx.sampleCode);
  const variantRef = variants.find((v) => v.variantId === ctx.variantId);
  const priorForSample = existing.filter((o) => o.context.sampleCode === ctx.sampleCode);

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div>
            <h1>Capture observation</h1>
            <div className="muted small">Context comes from the NESTMS reference data and cannot be edited here. Choose the sample, then work down the questionnaire. <kbd>Enter</kbd> or <kbd>Tab</kbd> moves to the next field.</div>
          </div>
          {DEMO_MODE && <span className="pill">Demo data</span>}
        </div>
        <div className="context-bar">
          <Sel label="Project" value={ctx.projectCode} onChange={(v) => setCtxField('projectCode', v)} options={projects.map((p) => [p.projectCode, `${p.projectCode}  ${p.projectName}`])} />
          <Sel label="Stability AR" value={ctx.arNumber} onChange={(v) => setCtxField('arNumber', v)} options={ars.map((a) => [a.arNumber, `${a.arNumber}  ${a.arTitle}`])} disabled={!ctx.projectCode} />
          <Sel label="Trial" value={ctx.trialNumber} onChange={(v) => setCtxField('trialNumber', v)} options={trials.map((t) => [t.trialNumber, `${t.trialNumber}  ${t.trialDescription}`])} disabled={!ctx.arNumber} />
          <Sel label="Variant" value={ctx.variantId} onChange={(v) => setCtxField('variantId', v)} options={variants.map((v) => [v.variantId, `${v.variantNumber}  ${v.variantDescription}`])} disabled={!ctx.trialNumber} />
          <Sel label="Sample" value={ctx.sampleCode} onChange={(v) => setCtxField('sampleCode', v)} options={samples.map((s) => [s.sampleCode, `${s.sampleCode}  (${condLabels[s.conditionCode] || s.conditionCode})`])} disabled={!ctx.variantId} />
          <Sel label="Time point" value={ctx.timePointCode} onChange={(v) => setCtxField('timePointCode', v)} options={(plan?.timePoints || []).map((tp) => [tp, vocabIndex.TIME_POINT?.values.find((x) => x.code === tp)?.label || tp])} disabled={!plan} />
          <div className="ctx"><span className="lbl">Storage condition</span><div className="ctx-readonly">{ctx.conditionCode ? condLabels[ctx.conditionCode] : <span className="muted">From sample</span>}</div></div>
          <Sel label="Questionnaire template" value={templateId} onChange={setTemplateId} options={classTemplates.map((t) => [t.templateId, `${t.templateName} (v${t.version}${t.status === 'DRAFT' ? ', draft' : ''})`])} disabled={!classTemplates.length} />
        </div>
      </div>

      {!contextComplete ? (
        <div className="grid-2">
          <div className="card">
            <h2>Choose the sample to observe</h2>
            <p className="muted">Pick the project, stability AR, trial, variant, sample and time point above. Trial, AR, variant, time point and storage condition are never typed in: they come from the AR plan so every observation stays traceable end to end.</p>
            {plan && <PlanGrid plan={plan} observations={existing.filter((o) => !ctx.variantId || o.context.variantId === ctx.variantId)} selected={ctx} condLabels={condLabels} onSelect={(tp, cond) => { setCtxField('timePointCode', tp); const s = samples.find((x) => x.conditionCode === cond); if (s) setCtxField('sampleCode', s.sampleCode); }} />}
          </div>
          <div className="card quiet">
            <h3>What this capture enforces</h3>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Structured descriptors from the controlled vocabulary; free text is supplementary only (R-13)</li>
              <li>An explicit N/A option instead of 9999, with a reason (R-13)</li>
              <li>Branching by defect type: sediment opens the Protein, Mineral or Cocoa sub-flow (R-16)</li>
              <li>Mandatory full-bottle and emptied-bottle photos; every file renamed to the standard convention before it lands in Blob (R-17, R-22)</li>
              <li>SOP 0 to 5 ratings for creaming, serum and sediment suggested from your measurements (SOP-00000202 Tables 2 to 4)</li>
              <li>pH and viscosity typed in from LIMS with instrument, shear rate and temperature (no LIMS integration)</li>
              <li>Required-field check before submission; nothing partial is stored (R-18, R-35)</li>
              <li>Draft kept on the device if the network drops (R-36)</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          <nav className="rail" aria-label="Questionnaire sections">
            {sections.map((s) => { const st = secStatus(s); return (
              <button key={s.label} type="button" className="rail-item" aria-current={active === s.label} style={{ '--stripe': `var(--d-${domainOf(s)})` }} onClick={() => { setActive(s.label); document.getElementById(`sec-${slug(s.label)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>
                <span className="rail-stripe" /><span className="name">{s.label}</span>
                <span className={`count ${st.req && st.done === st.req ? 'done' : ''}`}>{st.req ? `${st.done}/${st.req}` : ''}</span>
              </button>
            ); })}
          </nav>

          <div>
            {draftNotice && <div className="hint" style={{ marginBottom: 12 }}>Draft restored from this device (saved {new Date(draftNotice).toLocaleTimeString()}). <button className="btn link" onClick={() => { clearDraft(draftKey); setValues(freshValues()); setDraftNotice(null); }}>Discard draft</button></div>}
            {problems.length > 0 && (
              <div className="problems" role="alert">
                <b>{problems.length} item{problems.length > 1 ? 's' : ''} to fix before submitting</b>
                <ul>{problems.map((p) => <li key={p.fieldCode}><button type="button" onClick={() => { document.getElementById(`field-${p.fieldCode}`)?.scrollIntoView({ block: 'center' }); focusables.current.get(p.fieldCode)?.focus(); }}>{p.label}</button>: {p.reason}</li>)}</ul>
              </div>
            )}
            {sections.map((s) => (
              <section key={s.label} className="section" id={`sec-${slug(s.label)}`} style={{ '--stripe': `var(--d-${domainOf(s)})` }}>
                <div className="section-head"><span className="stripe" /><h2>{s.label}</h2><span className="scope">{catalog.domains.find((d) => d.domainCode === domainOf(s))?.mvpScope === 'SCHEMA_READY' ? 'Schema-ready domain' : ''}</span></div>
                {s.fields.map((f) => {
                  if (!isVisible(f, values, fieldIndex)) return null;
                  const ctxVal = isSystemField(f) ? headerValue(f, ctx, sample, user, vocabIndex, condLabels) : undefined;
                  return <FieldRow key={f.fieldCode} field={f} entry={values[f.fieldCode]} vocab={f.vocabularyCode ? vocabIndex[f.vocabularyCode] : null} onChange={onChange} onNext={focusNext} register={register}
                    required={isRequired(f, template)} isBranch={!!f.dependsOnField} hasProblem={problemSet.has(f.fieldCode)} readOnly={isSystemField(f)} context={{ ...ctx, [f.fieldCode]: ctxVal }}
                    suggestion={suggestions[f.fieldCode]} />;
                })}
              </section>
            ))}
            <div className="submit-bar">
              <div className="progress">
                <div className="track"><div className="fill" style={{ width: `${comp.required ? Math.round((comp.done / comp.required) * 100) : 0}%` }} /></div>
                <div className="txt">{comp.done} of {comp.required} required fields complete · {visibleOrdered.filter((f) => !isSystemField(f)).length} fields shown of {capturable.length} in template</div>
              </div>
              {!online && <span className="pill offline">Offline: will queue</span>}
              <button className="btn" onClick={() => { saveDraft(draftKey, { values: stripFiles(values), observationId: observationIdRef.current, context: ctx }); toast('Draft saved on this device'); }}>Save draft</button>
              <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit observation'}</button>
            </div>
          </div>

          <aside className="side stack">
            <div className="card">
              <h3>Sample</h3>
              <div className="kv">
                <span className="k">Sample</span><span className="v">{ctx.sampleCode}</span>
                <span className="k">Variant</span><span className="v">{ctx.variantNumber}</span>
                <span className="k">Condition</span><span className="v">{condLabels[ctx.conditionCode]}</span>
                <span className="k">Time point</span><span className="v">{ctx.timePointCode}</span>
                <span className="k">Container</span><span className="v">{vocabIndex.CONTAINER_TYPE?.values.find((x) => x.code === sample?.containerType)?.label || '—'}</span>
                {sample?.packageVolumeMl && <><span className="k">Nominal volume</span><span className="v">{sample.packageVolumeMl} mL</span></>}
                <span className="k">Observer</span><span className="v">{user.displayName}</span>
              </div>
            </div>
            <div className="card">
              <h3>Plan progress, {ctx.variantNumber}</h3>
              <PlanGrid plan={plan} observations={existing.filter((o) => o.context.variantId === ctx.variantId)} selected={ctx} condLabels={condLabels} onSelect={(tp, cond) => { setCtxField('timePointCode', tp); const s = samples.find((x) => x.conditionCode === cond); if (s) setCtxField('sampleCode', s.sampleCode); }} />
            </div>
            <div className="card quiet">
              <h3>Packaging and recipe facts</h3>
              <div className="kv">
                <span className="k">Bottle</span><span className="v">{[sample?.bottleClarity && (sample.bottleClarity === 'CLEAR' ? 'Clear' : 'Opaque'), sample?.bottleBaseGeometry && (sample.bottleBaseGeometry === 'RAISED_CENTER' ? 'raised center' : 'flat base')].filter(Boolean).join(', ') || 'Not recorded'}</span>
                {sample?.packagingDescription && <><span className="k">Packaging</span><span className="v">{sample.packagingDescription}</span></>}
                {sample?.sourceFactory && <><span className="k">Filled at</span><span className="v">{sample.sourceFactory}</span></>}
                {trial?.processScale && <><span className="k">Process scale</span><span className="v">{trial.processScale.replace(/_/g, ' ').toLowerCase()}</span></>}
                {variantRef?.phTarget && <><span className="k">pH target</span><span className="v">{variantRef.phTarget}</span></>}
                {variantRef?.containsHydrolysates !== undefined && variantRef?.containsHydrolysates !== null && <><span className="k">Hydrolysates</span><span className="v">{variantRef.containsHydrolysates ? 'Yes' : 'No'}</span></>}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>{sample?.bottleBaseGeometry === 'RAISED_CENTER' ? 'Raised-center bottle: the SOP needs 4 mm at the outer rim for a sediment rating of 4. The suggested ratings account for it.' : 'Measure sediment at the outer rim (SOP worst case). Ratings are suggested from your measurements.'}{variantRef?.containsHydrolysates ? ' Hydrolysate recipes are more prone to serum; record % of package volume when you see it.' : ''}</div>
            </div>
            {priorForSample.length > 0 && (
              <div className="card">
                <h3>Earlier pulls for this sample</h3>
                <div className="stack">
                  {priorForSample.slice(0, 6).map((o) => <div key={o.observationId} className="row spread small"><span>{o.context.timePointCode} · {new Date(o.observedAt).toLocaleDateString()}</span><span className={`pill ${o.overallResult === 'IN' ? 'ok' : o.overallResult === 'JUST_IN' ? 'watch' : 'fail'}`}>{{ IN: 'In', JUST_IN: 'Just In', OUT: 'Out' }[o.overallResult] || o.overallResult}</span></div>)}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {confirm && (
        <Modal title="Submit this observation?" onClose={() => setConfirm(null)} footer={<><button className="btn" onClick={() => setConfirm(null)}>Keep editing</button><button className="btn primary" onClick={confirmSubmit}>Submit</button></>}>
          <div className="kv">
            <span className="k">Sample</span><span className="v">{confirm.context.sampleCode}</span>
            <span className="k">Time point, condition</span><span className="v">{confirm.context.timePointCode}, {condLabels[confirm.context.conditionCode]}</span>
            <span className="k">Overall result</span><span className="v">{confirm.overallResultNA ? 'Not applicable' : confirm.overallResult}</span>
            <span className="k">Fields captured</span><span className="v">{confirm.values.length} ({confirm.values.filter((v) => v.isNA).length} marked N/A)</span>
            <span className="k">Media</span><span className="v">{confirm.media.length} file{confirm.media.length === 1 ? '' : 's'}</span>
            <span className="k">Lands at</span><span className="v mono small">observations/{observationBlobPath(confirm.context, confirm.observationId)}</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Media is uploaded first with its standard filename, then the record is written. If anything fails, nothing partial is stored (R-35).</p>
        </Modal>
      )}
    </div>
  );
}

function Sel({ label, value, onChange, options, disabled }) {
  return (
    <div className="ctx">
      <span className="lbl">{label}</span>
      <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{disabled ? '—' : 'Choose'}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
function headerValue(f, ctx, sample, user, vocabIndex, condLabels) {
  switch (f.fieldCode) {
    case 'project_code': return ctx.projectCode; case 'ar_number': return ctx.arNumber; case 'trial_number': return ctx.trialNumber; case 'variant_number': return ctx.variantNumber; case 'sample_code': return ctx.sampleCode;
    case 'time_point': return vocabIndex.TIME_POINT?.values.find((x) => x.code === ctx.timePointCode)?.label || ctx.timePointCode; case 'temperature_condition': return condLabels[ctx.conditionCode];
    case 'observer_user_id': return `${user.displayName} (${user.upn})`;
    case 'formulation_class': return vocabIndex.FORMULATION_CLASS?.values.find((x) => x.code === ctx.formulationClass)?.label || ctx.formulationClass;
    case 'test_status': return 'Draft until submitted';
    default: return undefined;
  }
}
function sanitizeMedia(m, ctx) { const { previewUrl, file, ...rest } = m; return { ...rest, blobUri: `https://<storageaccount>.blob.core.windows.net/media/${rest.blobPath}`, checksumSha256: null, _ctx: undefined, ...(ctx ? {} : {}) }; }
function stripFiles(values) { const out = {}; Object.entries(values).forEach(([k, e]) => { out[k] = Array.isArray(e?.value) && e.value[0]?.mediaAssetId ? { ...e, value: e.value.map(({ file, previewUrl, ...m }) => m) } : e; }); return out; }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const freshValues = () => ({ observation_timestamp: { value: new Date().toISOString(), isNA: false, naReason: null }, result_type: { value: 'SCHEDULED', isNA: false, naReason: null }, shake_protocol: { value: 'SOP_10X_180', isNA: false, naReason: null } });
