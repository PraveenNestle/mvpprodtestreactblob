// Authentication (R-29) and role-based access (R-30).
//   VITE_AUTH_MODE=msal  -> Microsoft Entra ID via @azure/msal-browser; roles come from the app-role claim on the id token
//   otherwise            -> demo personas (scientist / reviewer / admin) so RBAC can be exercised without a tenant
import { users as demoUsers } from '../api/demoData.js';

const MODE = import.meta.env.VITE_AUTH_MODE === 'msal' && import.meta.env.VITE_ENTRA_CLIENT_ID ? 'msal' : 'demo';
let msal = null; let account = null;
let currentDemoUser = demoUsers[2];
const listeners = new Set();

export const ROLES = { SCIENTIST: 'SCIENTIST', REVIEWER: 'REVIEWER', ADMIN: 'ADMIN' };
// What each role can do. Reviewers inherit scientist rights; admins inherit both (R-30).
export const PERMISSIONS = {
  SCIENTIST: ['capture', 'view'],
  REVIEWER: ['capture', 'view', 'review', 'export', 'templates'],
  ADMIN: ['capture', 'view', 'review', 'export', 'templates', 'admin'],
};
export const can = (user, permission) => !!user && (PERMISSIONS[user.role] || []).includes(permission);

export function authMode() { return MODE; }

export async function initAuth() {
  if (MODE !== 'msal') return currentUser();
  const { PublicClientApplication } = await import('@azure/msal-browser');
  msal = new PublicClientApplication({
    auth: { clientId: import.meta.env.VITE_ENTRA_CLIENT_ID, authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`, redirectUri: window.location.origin },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  account = result?.account || msal.getAllAccounts()[0] || null;
  if (!account) { await msal.loginRedirect({ scopes: [import.meta.env.VITE_API_SCOPE] }); return null; }
  return currentUser();
}

export function currentUser() {
  if (MODE === 'msal') {
    if (!account) return null;
    const roles = account.idTokenClaims?.roles || [];
    const role = roles.includes('Stability.Admin') ? 'ADMIN' : roles.includes('Stability.Reviewer') ? 'REVIEWER' : 'SCIENTIST';
    return { userId: account.localAccountId, displayName: account.name, upn: account.username, role };
  }
  return currentDemoUser;
}

export async function getAccessToken() {
  if (MODE !== 'msal' || !msal || !account) return null;
  try {
    const r = await msal.acquireTokenSilent({ scopes: [import.meta.env.VITE_API_SCOPE], account });
    return r.accessToken;
  } catch {
    await msal.acquireTokenRedirect({ scopes: [import.meta.env.VITE_API_SCOPE], account });
    return null;
  }
}

export function signOut() {
  if (MODE === 'msal' && msal) return msal.logoutRedirect();
  return null;
}

// Demo-only: switch persona to exercise RBAC
export function switchDemoUser(userId) {
  currentDemoUser = demoUsers.find((u) => u.userId === userId) || currentDemoUser;
  listeners.forEach((l) => l(currentDemoUser));
}
export function onUserChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export { demoUsers };
