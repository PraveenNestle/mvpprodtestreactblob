import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { RESULT_TONE, RESULT_LABEL } from '../lib/format.js';

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'info', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), ms);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function ResultPill({ result, na }) {
  if (na) return <span className="pill na">Not applicable</span>;
  if (!result) return <span className="pill">No result</span>;
  const label = RESULT_LABEL[result] || result;
  return <span className={`pill ${RESULT_TONE[result] || ''}`}>{label}</span>;
}

export function StatusPill({ status }) {
  const tone = { DRAFT: '', SUBMITTED: 'teal', REVIEWED: 'ok', REJECTED: 'fail' }[status] || '';
  const label = { DRAFT: 'Draft', SUBMITTED: 'Submitted', REVIEWED: 'Reviewed', REJECTED: 'Rejected' }[status] || status;
  return <span className={`pill ${tone}`}>{label}</span>;
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3><div>{children}</div></div>;
}

export const domainStyle = (domainCode) => ({ '--stripe': `var(--d-${domainCode}, var(--line))`, '--stripe-soft': 'var(--panel-2)' });
