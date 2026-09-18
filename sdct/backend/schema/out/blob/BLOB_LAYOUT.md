# Blob layout (the data store)

Azure Blob Storage is the only persistence layer. One storage account, five containers, blob versioning on. Everything below is created by `backend/infra/main.bicep`; the API never creates paths outside this layout.

| Container | Path | Content | Written by | Read by |
|---|---|---|---|---|
| `reference` | `projects.json`, `ars.json`, `trials.json`, `variants.json`, `samples.json`, `plans.json`, `users.json`, `_manifest.json` | NESTMS exports as JSON arrays (schema: `reference_bundle.schema.json`); manifest holds counts, source, updatedAt, updatedBy | Admin import (API) or `backend/api/tools/import_reference.mjs` on a schedule | API (context cascade, context verification), Power BI (`Reference_*` queries) |
| `observations` | `{PROJECT}/{AR}/{TRIAL}/{observationId}.json` | One document per observation (schema: `observation.schema.json`, 195 catalog fields). Amendments overwrite the document; blob versioning keeps every prior version; `versionNo` and `audit.previousVersionUri` link them | API only (create-only on first write) | API (review, detail), Power BI is not pointed here |
| `observations` | `_index/{AR}.json` | Current header per observation for that AR (fast list without scanning); updated with ETag concurrency | API | API |
| `media` | `{PROJECT}/{AR}/{TRIAL}/{standard filename}` | Photos and videos, renamed on upload to `{PROJECT}_{AR}_{TRIAL}_V{VARIANT}_{TP}_{COND}_{DOMAIN}_{FIELD}_{YYYYMMDD-HHMMSS}_{SEQ}.{ext}` | Device, with a 15-minute write-only SAS scoped to that exact path | API (existence check before commit), Power BI (blobUri), reviewers |
| `curated` | `observation_header/yyyy/mm/dd.ndjson`, `observation_value/...`, `media_asset/...`, `audit_log/...` | Append-only NDJSON datasets (columns: `curated_datasets.json`) | API, at submit / review / config change | Power BI (`power_query_blob.m`) |
| `config` | `templates/{templateId}/v{n}.json`, `vocabularies.json` | Versioned questionnaire templates (schema: `template.schema.json`) and the live vocabulary list | API (reviewer / admin actions) | API, React app |

## Rules the API enforces

1. **No partial records**: media blobs must exist before the observation document is written; the document is written create-only; curated rows and the audit event follow; a failure after the write deletes the document.
2. **Versioning**: a resubmission of an existing `observationId` becomes `versionNo + 1`; the previous document version stays retrievable through blob versioning and `audit.previousVersionUri`.
3. **Naming**: a SAS is only issued for a path that matches the convention regex, and a document is only accepted when every media entry's path matches it.
4. **Identity**: `observer` is rewritten from the Entra token; the client's claim is ignored.
5. **Reference integrity**: project / AR / trial / sample / condition must exist in `reference/` (FK check) before anything is written.

## Retention and cost

- `media`: lifecycle policy cools blobs after 90 days and archives after 3 years; documents and curated data stay hot (tens of MB per year at URS volumes).
- Blob versioning and 30-day soft delete on all containers; the change feed is enabled for a year so any external system can replay events.
- URS sizing (~120k observations, ~127 values each, ~6 media each over 2 years) lands at roughly 15M curated value rows (~5 GB NDJSON) and ~700k media files: comfortable for Blob and for Power BI import mode with monthly partitions.

## How this maps to what a database would have given you

| Relational concept | Where it lives here |
|---|---|
| Reference tables (project, AR, trial, variant, sample, plan, user) | `reference/*.json` |
| Transaction table OBSERVATION | `observations/**/*.json` (record) + `curated/observation_header` (analytics) |
| Typed EAV table OBSERVATION_VALUE | `values[]` in each document + `curated/observation_value` |
| MEDIA_ASSET | `media[]` in each document + `curated/media_asset` + the files in `media/` |
| AUDIT_LOG | `curated/audit_log` (append-only) |
| Views (current, flat per field, incidence, plan progress) | Power Query queries in `power_query_blob.m` (refresh in Power BI or a dataflow) |
| Primary key / uniqueness | create-only writes (`If-None-Match: *`) and ETag-guarded index updates |
| Foreign keys | API reference check before write |
| Transactions | ordered writes with compensating delete |
