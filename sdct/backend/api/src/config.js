const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));
export const config = {
  port: Number(process.env.PORT || 8080),
  localMode: bool(process.env.LOCAL_MODE, false),
  staticDir: process.env.STATIC_DIR || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  entra: { tenantId: process.env.ENTRA_TENANT_ID || '', audience: process.env.ENTRA_API_AUDIENCE || '' },
  storage: {
    accountName: process.env.STORAGE_ACCOUNT_NAME || '', connectionString: process.env.STORAGE_CONNECTION_STRING || '',
    containers: {
      reference: process.env.CONTAINER_REFERENCE || 'reference', observations: process.env.CONTAINER_OBSERVATIONS || 'observations',
      media: process.env.CONTAINER_MEDIA || 'media', curated: process.env.CONTAINER_CURATED || 'curated', config: process.env.CONTAINER_CONFIG || 'config',
    },
    sasUploadMinutes: Number(process.env.SAS_UPLOAD_MINUTES || 15),
  },
};
