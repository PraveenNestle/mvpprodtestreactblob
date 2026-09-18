import React, { useCallback, useEffect, useState } from 'react';
import { api, DEMO_MODE, catalog as fallbackCatalog } from './api/index.js';
import { initAuth, currentUser, onUserChange, switchDemoUser, demoUsers, authMode, can, signOut } from './auth/auth.js';
import { ToastProvider, useToast } from './components/ui.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { CaptureScreen } from './screens/CaptureScreen.jsx';
import { ReviewScreen } from './screens/ReviewScreen.jsx';
import { TemplatesScreen } from './screens/TemplatesScreen.jsx';
import { AdminScreen } from './screens/AdminScreen.jsx';
import { onConnectivity, queued, dequeue } from './lib/offlineQueue.js';

const NAV = [['home', 'Home', 'view'], ['capture', 'Capture', 'capture'], ['review', 'Review', 'view'], ['templates', 'Templates', 'view'], ['admin', 'Admin', 'admin']];

function Shell() {
  const toast = useToast();
  const [user, setUser] = useState(() => (authMode() === 'demo' ? currentUser() : null));
  const [catalog, setCatalog] = useState(() => (DEMO_MODE ? fallbackCatalog : null));
  const [loadError, setLoadError] = useState(null);
  const [route, setRoute] = useState({ name: 'home' });
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(queued().length);

  useEffect(() => { initAuth().then(setUser).catch((err) => setLoadError(err.message || 'Authentication failed')); return onUserChange(setUser); }, []);
  const reloadCatalog = useCallback(() => api.getCatalog().then(setCatalog).catch((err) => {
    if (DEMO_MODE) setCatalog(fallbackCatalog);
    else setLoadError(err.message || 'Catalog load failed');
  }), []);
  useEffect(() => { reloadCatalog(); }, [reloadCatalog]);

  // Flush the offline queue when connectivity returns (R-36)
  useEffect(() => onConnectivity(async (isOnline) => {
    setOnline(isOnline);
    if (!isOnline) return;
    for (const item of queued()) {
      try { await api.submitObservation(item.doc, []); dequeue(item.id); toast(`Synced queued observation for ${item.doc.context.sampleCode}`, 'ok'); } catch { /* keep in queue */ }
    }
    setPending(queued().length);
  }), [toast]);

  const go = (name, params = {}) => { setRoute({ name, ...params }); window.scrollTo({ top: 0 }); };
  const activeUser = user || currentUser() || demoUsers[2];
  const activeCatalog = catalog || fallbackCatalog;
  if (loadError) return <div className="empty"><h3>Stability Capture could not start</h3><p>{loadError}</p><p className="small muted">Check the deployed frontend settings, API health endpoint, and Entra configuration.</p></div>;

  const initials = activeUser.displayName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SC</span>Stability Capture</div>
        <nav className="nav" aria-label="Main">
          {NAV.filter(([, , perm]) => can(activeUser, perm)).map(([k, l]) => <button key={k} onClick={() => go(k)} aria-current={route.name === k ? 'page' : undefined}>{l}</button>)}
        </nav>
        <div className="topbar-right">
          {!online && <span className="pill offline">Offline</span>}
          {pending > 0 && <span className="pill watch">{pending} queued</span>}
          {DEMO_MODE && <span className="pill">Demo, no backend</span>}
          <div className="user-menu">
            <span className="avatar" aria-hidden="true">{initials}</span>
            {authMode() === 'demo' ? (
              <select value={activeUser.userId} onChange={(e) => switchDemoUser(e.target.value)} aria-label="Switch demo persona" title="Switch persona to exercise role-based access">
                {demoUsers.map((u) => <option key={u.userId} value={u.userId}>{u.displayName} · {u.role.toLowerCase()}</option>)}
              </select>
            ) : (
              <><span className="small"><b>{activeUser.displayName}</b> · {activeUser.role.toLowerCase()}</span><button className="btn xs" onClick={signOut}>Sign out</button></>
            )}
          </div>
        </div>
      </header>
      <main className="main">
        {route.name === 'home' && <HomeScreen catalog={activeCatalog} user={activeUser} onCapture={(ctx) => go('capture', { ctx })} onReview={(id) => go('review', { focusId: id })} />}
        {route.name === 'capture' && <CaptureScreen key={JSON.stringify(route.ctx || {})} catalog={activeCatalog} user={activeUser} online={online} initialContext={route.ctx} onSubmitted={() => setPending(queued().length)} />}
        {route.name === 'review' && <ReviewScreen catalog={activeCatalog} user={activeUser} focusId={route.focusId} onOpenCapture={(ctx) => go('capture', { ctx })} />}
        {route.name === 'templates' && <TemplatesScreen catalog={activeCatalog} user={activeUser} />}
        {route.name === 'admin' && (can(activeUser, 'admin') ? <AdminScreen catalog={activeCatalog} user={activeUser} onCatalogChange={reloadCatalog} /> : <div className="card">Administration is limited to the admin role.</div>)}
      </main>
    </div>
  );
}

export default function App() { return <ToastProvider><Shell /></ToastProvider>; }
