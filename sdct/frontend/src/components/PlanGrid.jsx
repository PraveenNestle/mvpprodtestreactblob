import React from 'react';
import { dueDate } from '../api/demoData.js';

// Cell status mirrors V_STABILITY_PLAN_PROGRESS: CAPTURED, DUE (within 7 days), OVERDUE (>7 days past due, nothing captured), PLANNED
export function cellStatus(plan, tp, cond, observations, today = new Date('2026-08-31')) {
  const captured = observations.some((o) => o.context.timePointCode === tp && o.context.conditionCode === cond && o.status !== 'DRAFT');
  if (captured) return 'captured';
  const due = new Date(dueDate(plan, tp));
  const diff = (today - due) / 86400000;
  if (diff > 7) return 'overdue';
  if (diff >= -7) return 'due';
  return 'planned';
}

export function PlanGrid({ plan, observations, selected, onSelect, condLabels }) {
  if (!plan) return <div className="hint">Choose a stability AR to see its plan.</div>;
  const cols = plan.conditions;
  return (
    <div className="stack">
      <div className="plan-grid" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(44px, 1fr))` }} role="grid" aria-label="Stability plan progress">
        <div className="hdr" />
        {cols.map((c) => <div key={c} className="hdr" title={condLabels?.[c] || c}>{c}</div>)}
        {plan.timePoints.map((tp) => (
          <React.Fragment key={tp}>
            <div className="rowhdr">{tp}</div>
            {cols.map((c) => {
              const st = cellStatus(plan, tp, c, observations);
              const isSel = selected?.timePointCode === tp && selected?.conditionCode === c;
              const n = observations.filter((o) => o.context.timePointCode === tp && o.context.conditionCode === c && o.status !== 'DRAFT').length;
              return (
                <button key={c} type="button" className={`plan-cell ${st} ${isSel ? 'selected' : ''}`} title={`${tp} at ${condLabels?.[c] || c}: ${st}, due ${dueDate(plan, tp)}`} onClick={() => onSelect?.(tp, c)} aria-label={`${tp} ${c} ${st}`}>
                  {st === 'captured' ? (n > 1 ? n : '✓') : st === 'overdue' ? '!' : st === 'due' ? '•' : ''}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--ok-soft)' }} />Captured</span>
        <span><i style={{ background: 'var(--watch-soft)' }} />Due this week</span>
        <span><i style={{ background: 'var(--fail-soft)' }} />Overdue</span>
        <span><i style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} />Planned</span>
      </div>
      <div className="small muted">Plan {plan.planId} v{plan.planVersion}, {plan.intervalScheme.replace(/_/g, ' ').toLowerCase()}, {plan.durationMonths} months, {plan.planStatus.toLowerCase()}. Read-only from {plan.sourceSystem}.</div>
    </div>
  );
}
