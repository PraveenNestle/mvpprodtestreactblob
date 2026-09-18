# R&D Stability Data Collection Tool (Stability Capture)

Guided capture of physical stability observations for Product Development at NPTC Bridgewater, replacing the shared Excel workbook and the 9999 placeholder with a governed, photo-backed record that keeps the SOP 0 to 5 ratings the team works with, now suggested from measurements instead of estimated. **Azure Blob Storage is the only data store**: reference data, observation records, media, the analytics layer Power BI reads, templates and vocabularies all live in one storage account.

Built against **URS V2 (31 March 2026)**, the **One-Pager V6** and the **Solution Architecture V2**, and shaped by the DXC scoping call (React front end on Azure Web App, Blob back end, template builder, fast Enter/Tab entry, mobile camera capture, Power BI on top).

```
sdct/
├── frontend/                React + Vite app (tablet-first). `npm run build:mockup` produces one self-contained demo HTML file
│   └── src/
│       ├── screens/         Home, Capture, Review, Templates, Admin (vocabularies, catalog, reference data, audit, roles)
│       ├── components/      FieldRow (typed input + explicit N/A pill), MediaCapture, PlanGrid, ObservationDetail
│       ├── lib/             naming (media convention), branching (R-16), validation (R-18), csv import, offline queue (R-36)
│       ├── api/             one interface, two implementations: demo (in-memory) and the real HTTP client
│       └── auth/            Entra ID via MSAL with app-role RBAC; demo personas when no tenant is configured
├── backend/
│   ├── schema/              THE source of truth: field_catalog.csv (113 URS + 66 SOP + 16 extension fields), vocabularies.csv, templates.json
│   │   │                    refresh_2026-09_sop_alignment.py is the record of the SOP / spreadsheet / Mural refresh
│   │   ├── generate_schema.py   one run regenerates everything below and the app's catalog.json
│   │   └── out/
│   │       ├── blob/        observation.schema.json, template.schema.json, reference_bundle.schema.json (what the API validates),
│   │       │                curated_datasets.json (column definitions of the NDJSON datasets), BLOB_LAYOUT.md (the Blob equivalent of DDL)
│   │       ├── powerbi/     power_query_blob.m: reference tables, current observations, one column per field, defect incidence,
│   │       │                plan progress, media coverage, audit (generated from the catalog)
│   │       └── SCHEMA_SUMMARY.md
│   ├── api/                 Express API for Azure Web App: Entra JWT, schema + business validation, transactional Blob landing,
│   │   │                    write-only SAS for media, naming enforcement, versioning, per-AR index, curated NDJSON, audit, reference import.
│   │   │                    LOCAL_MODE runs everything in memory with no Azure.
│   │   └── tools/           import_reference.mjs: load the NESTMS export into the reference container; import_history.mjs: load the stability spreadsheets as history
│   └── infra/               main.bicep (storage account with five containers, versioning, lifecycle, Web App with managed identity, RBAC,
│                            App Insights), entra-app-roles.json, deploy.sh, reference_data_sync.md
├── reports/                 five Power BI-style HTML reports built from the same seeded data (build_reports.py)
└── docs/                    requirements traceability, SOP alignment, architecture decisions, open items, one-pager deltas
```

## Run the demo (no backend, no Azure)

Open `frontend/dist-mockup/index.html` in a browser (or `Stability_Capture_Mockup.html` from the delivery folder). It runs entirely in the browser with 126 seeded observations across 5 ARs. Switch persona (scientist, reviewer, admin) from the top right to see role-based access change what the app offers.

## Run the real stack locally

```bash
cd backend/api && npm install && npm run dev            # API on :8080, LOCAL_MODE (in-memory, demo reference data, x-demo-user header)
cd frontend && cp .env.example .env                     # set VITE_API_BASE=http://localhost:8080 to leave demo mode
npm install && npm run dev                              # React on :5173, proxies /api to :8080
cd backend/api && npm test                              # end-to-end smoke test: SAS grant, upload, submit, versioning, review, audit, export, reference import
```

## Deploy to Azure

`backend/infra/deploy.sh dev` registers the two Entra apps (API with app roles, SPA), deploys `main.bicep` (one storage account, one Web App), builds the React app with the tenant settings, zips `frontend/dist` and `backend/api` into one Node Web App and registers the redirect URI. Then load reference data (Admin screen or `npm run import-reference`, see `backend/infra/reference_data_sync.md`) and assign users to app roles.

## Change a field, a value, or a template

Edit `backend/schema/field_catalog.csv` or `vocabularies.csv` (or add a value in the Admin screen, which writes `config/vocabularies.json`) and run `python3 backend/schema/generate_schema.py`. The JSON Schemas, the curated dataset definitions, the Power Query layer and the app's `catalog.json` are regenerated together, so the questionnaire, the stored records and the reports cannot drift apart. Templates are versioned in `config/templates/<id>/v<n>.json`; observations keep the template version they were captured with.

## How an observation flows

1. Scientist picks Project → AR → Trial → Variant → Sample → Time point (all read-only from `reference/`, the NESTMS export), and a template. pH and viscosity are typed in from LIMS with instrument, shear rate and temperature; there is no LIMS integration.
2. Fields render in template order; branching shows sub-questions only when the parent answer triggers them (sediment type opens Protein, Mineral or Cocoa). Every measurement row has an explicit **N/A** pill with a reason. The SOP 0 to 5 rating for creaming, serum and sediment is suggested from the measurement (ring mm, % of package volume, sediment mm plus coverage and bottle geometry) and confirmed by the scientist.
3. A full-bottle photo before pouring and an emptied-bottle photo after pouring are mandatory; other photos and videos are optional. All come from the device camera. The app names each file `{PROJECT}_{AR}_{TRIAL}_V{VARIANT}_{TP}_{COND}_{DOMAIN}_{FIELD}_{YYYYMMDD-HHMMSS}_{SEQ}.{ext}`; the API signs a 15-minute write-only SAS for exactly that path and the device uploads straight to `media/`.
4. Submit: the API validates the document against the generated JSON Schema, checks the context exists in `reference/`, confirms every media blob landed, then writes `observations/{PROJECT}/{AR}/{TRIAL}/{observationId}.json` (create-only; blob versioning keeps history), updates the per-AR index, appends flat rows to `curated/` and an audit event. Any failure after the write removes the document, so nothing partial exists.
5. Power BI reads `curated/` and `reference/` directly with the generated Power Query (`power_query_blob.m`): current observations, one column per field, defect incidence, plan progress, media coverage, audit.
6. Drafts persist on the device; if the network drops, the submission queues and flushes when the browser is back online.
