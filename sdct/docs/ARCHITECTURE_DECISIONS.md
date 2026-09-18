# Architecture decisions

## 1. One field catalog generates everything
`backend/schema/field_catalog.csv` (127 core fields, the URS Appendix A count, plus 16 powder/VMS extension fields) and `vocabularies.csv` are the only hand-maintained definitions. `generate_schema.py` emits the JSON Schemas the API validates against (observation, template, reference bundle), the curated dataset definitions, the Power Query layer with one typed column per field, and the app's `catalog.json`. A new descriptor is one CSV row and one script run; the questionnaire, the stored records and the reports move together.

## 2. Azure Blob Storage is the only data store
No relational database and no warehouse. One storage account, five containers: `reference` (the NESTMS export as JSON), `observations` (one versioned JSON document per observation plus a per-AR index), `media` (renamed photos and videos), `curated` (append-only NDJSON datasets Power BI reads), `config` (versioned templates, live vocabularies). `BLOB_LAYOUT.md` maps every relational concept (tables, keys, foreign keys, views, transactions) to where it lives here. This keeps the PoV footprint to one Web App and one storage account, with no ingestion pipeline to operate.

## 3. Documents for the record, NDJSON for analytics
The observation document is the record: complete, validated, versioned. At the same moment the API appends flat rows to `curated/observation_header`, `observation_value` (typed, with `isNA` and `naReason`), `media_asset` and `audit_log`, partitioned by day. Power BI never parses documents; it reads folders. The generated Power Query pivots `observation_value` to one column per field, derives current versions (latest `appendedAt` per observation), defect incidence, plan progress and media coverage. At URS volumes (~120k observations, ~15M value rows over two years) this is a few GB of NDJSON, well inside Power BI import mode with monthly partitions.

## 4. Reference data is loaded, never typed; lab results are typed, never integrated
Project, AR, trial, variant, sample and plan come from `reference/` and are shown read-only. pH, viscosity, Brix and D50 are typed in from LIMS by the scientist with instrument, geometry, shear rate and temperature and a source flag, because there is no LIMS integration in this application (decision of 1 September 2026). Two load paths: the Admin screen (upload a bundle) and the `import_reference.mjs` CLI for scheduled exports. Both validate against `reference_bundle.schema.json` (condition and time point codes are enforced against the capture vocabulary) and check parent/child integrity; the manifest is written last so a partial load is never visible. The API re-checks the context against `reference/` before writing any observation: the Blob equivalent of a foreign key.

## 5. Media never passes through the Web App
The device asks the API for a write-only, create-only SAS scoped to the exact convention path, uploads straight to Blob, then submits the record. The API confirms each blob exists before it writes anything. Uploads of 2 to 20 MB per file do not tie up the Web App, which is how the < 3 s response target (R-34) survives 15 concurrent users.

## 6. No partial records, by construction
Order of operations at submit: schema validation → business rules (N/A allowed, no 9999, ranges) → context exists in `reference/` → every media blob present → create-only document write → index update (ETag-guarded) → curated rows → audit. A failure after the write deletes the document. Amendments never overwrite silently: they create `versionNo + 1`, blob versioning keeps the previous document, and `audit.previousVersionUri` links them.

## 7. Identity comes from the token, never from the payload
The API rewrites `observer` from the validated Entra token (tested: a payload claiming Admin was stored as the real caller). Roles are Entra app roles; the same permission map runs in the SPA and the API.

## 8. Templates are versioned, observations pin their version
Publishing a template creates `v(n+1)` and retires the previous active version. Each observation carries `templateId` and `templateVersion`, so a later template change never alters what a historic observation asked.

## 9. The SOP rating is kept, and derived
The URS asked to move past the 0 to 5 scale; the SOP defines it and the team communicates in it. Both are true at once: the app captures the measurement and suggests the SOP rating from it (`lib/ratings.js`, one rule set for the app, the demo data and the reports), the scientist confirms or overrides, and both are stored. History stays comparable and the numbers are there for the day the KSCs move to measurements.

## 10. Explicit N/A is a first-class value
Every eligible field has an N/A pill with a reason list. N/A is stored as `isNA = true` with `naReason`, flows into the curated rows as null with the reason alongside, and 9999 is rejected at both ends. This is the URS's most quoted pain point (R-13) and the cheapest to get right structurally.

## 11. Demo mode is the same code
The mockup is the production bundle with `VITE_API_BASE` empty. The same screens, validation, branching and naming run against an in-memory API with 126 seeded observations, and the Express API has a matching LOCAL_MODE. Reviewers can exercise the whole flow with no tenant and no storage account.
