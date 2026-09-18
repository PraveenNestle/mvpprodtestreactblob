// Authentication (R-29) and authorisation (R-30).
// Production: bearer tokens from Microsoft Entra ID, validated against the tenant's JWKS; roles from the token's app roles.
// LOCAL_MODE: an `x-demo-user` header (scientist | reviewer | admin) selects a demo persona so the API can be exercised without a tenant.
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config.js';
import { demoUsers } from '../services/reference.js';

export const PERMISSIONS = {
  SCIENTIST: ['capture', 'view'],
  REVIEWER: ['capture', 'view', 'review', 'export', 'templates'],
  ADMIN: ['capture', 'view', 'review', 'export', 'templates', 'admin'],
};
const ROLE_CLAIMS = { 'Stability.Admin': 'ADMIN', 'Stability.Reviewer': 'REVIEWER', 'Stability.Scientist': 'SCIENTIST' };

let jwks = null;
function getKey(header, cb) {
  if (!jwks) jwks = jwksClient({ jwksUri: `https://login.microsoftonline.com/${config.entra.tenantId}/discovery/v2.0/keys`, cache: true, rateLimit: true });
  jwks.getSigningKey(header.kid, (err, key) => cb(err, key?.getPublicKey()));
}

export function authenticate(req, res, next) {
  if (config.localMode) {
    const persona = String(req.header('x-demo-user') || 'scientist').toLowerCase();
    const u = demoUsers.find((x) => x.role.toLowerCase() === persona) || demoUsers.find((x) => x.userId === persona) || demoUsers[2];
    req.user = { userId: u.userId, displayName: u.displayName, upn: u.upn, role: u.role };
    return next();
  }
  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  const issuers = [`https://login.microsoftonline.com/${config.entra.tenantId}/v2.0`, `https://sts.windows.net/${config.entra.tenantId}/`];
  jwt.verify(token, getKey, { audience: [config.entra.audience, config.entra.audience.replace('api://', '')], issuer: issuers, algorithms: ['RS256'] }, (err, claims) => {
    if (err) return res.status(401).json({ error: `Token rejected: ${err.message}` });
    const roles = claims.roles || [];
    const role = roles.map((r) => ROLE_CLAIMS[r]).filter(Boolean).sort((a, b) => Object.keys(PERMISSIONS).indexOf(b) - Object.keys(PERMISSIONS).indexOf(a))[0] || 'SCIENTIST';
    req.user = { userId: claims.oid || claims.sub, displayName: claims.name || claims.preferred_username || 'Unknown', upn: claims.preferred_username || claims.upn || '', role };
    next();
  });
}

export const requirePermission = (perm) => (req, res, next) => {
  if (!req.user || !(PERMISSIONS[req.user.role] || []).includes(perm)) return res.status(403).json({ error: `Role ${req.user?.role || 'none'} cannot ${perm}` });
  next();
};
