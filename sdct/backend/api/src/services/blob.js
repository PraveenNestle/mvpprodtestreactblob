// Azure Blob Storage is the only data store (R-22, R-23, R-35). Layout (see backend/schema/out/blob/BLOB_LAYOUT.md):
//   reference/{entity}.json + _manifest.json                    NESTMS / LIMS exports: projects, ARs, trials, variants, samples, plans, lab results, users
//   observations/{PROJECT}/{AR}/{TRIAL}/{observationId}.json   one JSON document per observation; blob versioning keeps every prior version
//   observations/_index/{AR}.json                              current header per observation for fast lists (ETag-guarded updates)
//   media/{PROJECT}/{AR}/{TRIAL}/{standard filename}            uploaded by the device with a 15-minute write-only SAS, renamed per convention
//   curated/observation_header|observation_value|media_asset|audit_log/{yyyy}/{mm}/{dd}.ndjson   append blobs Power BI reads directly
//   config/templates/{templateId}/v{n}.json, config/vocabularies.json
// LOCAL_MODE keeps everything in memory so the API can run on a laptop with no Azure subscription.
import { config } from '../config.js';

let containers = null; // container name -> ContainerClient
let credential = null; let accountKey = null;

async function init() {
  if (containers) return;
  const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');
  let svc;
  if (config.storage.connectionString) {
    svc = BlobServiceClient.fromConnectionString(config.storage.connectionString);
    const m = /AccountName=([^;]+);AccountKey=([^;]+)/.exec(config.storage.connectionString);
    if (m) { credential = new StorageSharedKeyCredential(m[1], m[2]); accountKey = m[2]; }
  } else {
    const { DefaultAzureCredential } = await import('@azure/identity');
    credential = new DefaultAzureCredential();
    svc = new BlobServiceClient(`https://${config.storage.accountName}.blob.core.windows.net`, credential);
  }
  containers = {};
  for (const name of Object.values(config.storage.containers)) { containers[name] = svc.getContainerClient(name); await containers[name].createIfNotExists(); }
  containers._svc = svc;
}

const mem = { blobs: new Map(), appends: new Map() }; // path -> { body, contentType, metadata, versions: [] }
const key = (c, p) => `${c}/${p}`;

export const blob = {
  async putJson(container, path, doc, { metadata = {}, ifNoneMatch, ifMatch } = {}) {
    if (config.localMode) {
      const k = key(container, path); const prev = mem.blobs.get(k);
      if (ifNoneMatch === '*' && prev) { const e = new Error('Blob already exists'); e.statusCode = 409; throw e; }
      if (ifMatch && prev && prev.etag !== ifMatch) { const e = new Error('ETag mismatch'); e.statusCode = 412; throw e; }
      const versionId = new Date().toISOString(); const etag = `"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
      mem.blobs.set(k, { body: JSON.stringify(doc), contentType: 'application/json', metadata, versionId, etag, versions: [...(prev?.versions || []), ...(prev ? [prev.versionId] : [])] });
      return { versionId, etag, url: `memory://${k}` };
    }
    await init();
    const client = containers[container].getBlockBlobClient(path);
    const body = JSON.stringify(doc);
    const conditions = ifNoneMatch ? { ifNoneMatch } : ifMatch ? { ifMatch } : undefined;
    const res = await client.upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: 'application/json' }, metadata, conditions });
    return { versionId: res.versionId, etag: res.etag, url: client.url };
  },
  async getJson(container, path) { return (await this.getJsonWithEtag(container, path)).doc; },
  // Returns { doc, etag } so callers can do optimistic-concurrency updates (used for the per-AR observation index)
  async getJsonWithEtag(container, path) {
    if (config.localMode) { const b = mem.blobs.get(key(container, path)); return b ? { doc: JSON.parse(b.body), etag: b.etag } : { doc: null, etag: null }; }
    await init();
    const client = containers[container].getBlobClient(path);
    if (!(await client.exists())) return { doc: null, etag: null };
    const res = await client.download();
    const chunks = []; for await (const c of res.readableStreamBody) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return { doc: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: res.etag };
  },
  async list(container, prefix) {
    if (config.localMode) return [...mem.blobs.keys()].filter((k) => k.startsWith(`${container}/${prefix || ''}`)).map((k) => k.slice(container.length + 1));
    await init();
    const out = []; for await (const b of containers[container].listBlobsFlat({ prefix })) out.push(b.name); return out;
  },
  async deleteBlob(container, path) {
    if (config.localMode) { mem.blobs.delete(key(container, path)); return; }
    await init(); await containers[container].getBlobClient(path).deleteIfExists();
  },
  // Media proof-of-upload: the device uploaded with the SAS; the API confirms the blob exists and reads its properties before committing the record
  async mediaProperties(path) {
    if (config.localMode) return mem.blobs.has(key(config.storage.containers.media, path)) ? { exists: true, contentLength: 0, contentMD5: null } : { exists: false };
    await init();
    const client = containers[config.storage.containers.media].getBlobClient(path);
    if (!(await client.exists())) return { exists: false };
    const p = await client.getProperties();
    return { exists: true, contentLength: p.contentLength, contentType: p.contentType, contentMD5: p.contentMD5 ? Buffer.from(p.contentMD5).toString('base64') : null, lastModified: p.lastModified, metadata: p.metadata };
  },
  // Local-mode helper so tests can "upload" media
  async _localPutMedia(path) { mem.blobs.set(key(config.storage.containers.media, path), { body: '', contentType: 'image/jpeg', metadata: {} }); },
  // Write-only, create-only SAS scoped to the exact blob path the naming convention produced (R-22). Expires in minutes.
  async uploadSas(path, contentType) {
    if (config.localMode) return { uploadUrl: `http://localhost:${config.port}/local-upload/${encodeURIComponent(path)}`, expiresOn: new Date(Date.now() + 15 * 60000).toISOString(), local: true };
    await init();
    const { BlobSASPermissions, generateBlobSASQueryParameters, SASProtocol } = await import('@azure/storage-blob');
    const container = config.storage.containers.media;
    const expiresOn = new Date(Date.now() + config.storage.sasUploadMinutes * 60000);
    const startsOn = new Date(Date.now() - 5 * 60000);
    const permissions = BlobSASPermissions.parse('cw');
    let sas;
    if (accountKey) {
      sas = generateBlobSASQueryParameters({ containerName: container, blobName: path, permissions, startsOn, expiresOn, protocol: SASProtocol.Https, contentType }, credential).toString();
    } else {
      const udk = await containers._svc.getUserDelegationKey(startsOn, expiresOn);
      sas = generateBlobSASQueryParameters({ containerName: container, blobName: path, permissions, startsOn, expiresOn, protocol: SASProtocol.Https, contentType }, udk, config.storage.accountName).toString();
    }
    return { uploadUrl: `${containers[container].getBlockBlobClient(path).url}?${sas}`, expiresOn: expiresOn.toISOString() };
  },
  // Curated NDJSON: append blobs partitioned by day, one file per dataset. Power BI reads the folders directly (power_query_blob.m).
  async appendNdjson(entity, rows, when = new Date()) {
    if (!rows.length) return;
    const d = when.toISOString().slice(0, 10).split('-');
    const path = `${entity}/${d[0]}/${d[1]}/${d[2]}.ndjson`;
    const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    if (config.localMode) { const k = key(config.storage.containers.curated, path); mem.appends.set(k, (mem.appends.get(k) || '') + text); return path; }
    await init();
    const client = containers[config.storage.containers.curated].getAppendBlobClient(path);
    await client.createIfNotExists({ blobHTTPHeaders: { blobContentType: 'application/x-ndjson' } });
    await client.appendBlock(text, Buffer.byteLength(text));
    return path;
  },
  async readNdjson(entity) {
    if (config.localMode) return [...mem.appends.entries()].filter(([k]) => k.startsWith(`${config.storage.containers.curated}/${entity}/`)).flatMap(([, v]) => v.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    await init();
    const out = [];
    for await (const b of containers[config.storage.containers.curated].listBlobsFlat({ prefix: `${entity}/` })) {
      const buf = await containers[config.storage.containers.curated].getBlobClient(b.name).downloadToBuffer();
      buf.toString('utf8').split('\n').filter(Boolean).forEach((l) => out.push(JSON.parse(l)));
    }
    return out;
  },
};
