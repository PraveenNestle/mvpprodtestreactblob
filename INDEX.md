# R&D Stability Data Collection Tool: delivery contents (Azure Blob Storage only, SOP-aligned)

| File | What it is | Open with |
|---|---|---|
| `install.sh` | Bundle entry point with all install-time variables in a configuration block at the top (storage account, delivery container and prefix, resource group, environment, auth mode, runtime container names). Commands: `check`, `upload` (installs the bundle into the Azure storage account), `test` (end-to-end API smoke test), `local`, `azure [env]`, `clean` | bash |
| `DEPLOYMENT_GUIDE.md` | Technical deployment guide: components, prerequisites, the configuration block, Azure deployment step by step, the one manual Entra step, installing the bundle into the storage account, reference data load, Power BI connection, verification checklist, promotion, rollback, troubleshooting | Editor |
| `SHA256SUMS.txt` | Checksums for every file in the bundle; verified by `./install.sh check` | sha256sum -c |
| `Stability_Capture_Mockup.html` | The complete React app as one self-contained file, demo mode, 126 seeded observations across 5 ARs. Try: Capture → AR-10421 → enter a cream ring thickness and watch the SOP rating follow; Review → Rating matrix; Admin → Reference data. | Any browser; works offline; tablet or desktop |
| `reports/01_stability_program_overview.html` | Program KPIs, defect incidence by domain, monthly capture, plan progress, AR table (In / Just In / Out) | Browser |
| `reports/02_trial_trend_analysis.html` | AR-10421 / 10421.001: cream thickness and serum trends, result heatmap, redispersion, pH and viscosity typed from LIMS, SOP rating trends, the SOP rating sheet, variant comparison | Browser |
| `reports/03_stability_plan_compliance.html` | Per-AR plan grids (captured, due, overdue, planned), lateness, review turnaround, upcoming pulls | Browser |
| `reports/04_observation_detail_media.html` | Media coverage by domain and AR, naming convention decomposed, N/A usage, recent observations | Browser |
| `reports/05_cross_project_benchmarking.html` | Defect incidence by project, In rate by condition, samples still In over time, viscosity drift, scorecard | Browser |
| `blob_schema/BLOB_LAYOUT.md` | The five containers, every path, naming, versioning, indexes, retention, and how each relational concept maps to Blob | Editor |
| `blob_schema/observation.schema.json`, `template.schema.json`, `reference_bundle.schema.json` | JSON Schemas the API validates every observation, template and reference import against | Editor |
| `blob_schema/curated_datasets.json` | Column definitions of the four NDJSON datasets in `curated/` plus the one-column-per-field list | Editor |
| `blob_schema/field_catalog.csv`, `vocabularies.csv` | The source of truth: 113 URS + 66 SOP-derived + 16 extension fields, 46 vocabularies | Excel / editor |
| `blob_schema/SCHEMA_SUMMARY.md` | Every field, type, unit, vocabulary, branching rule and source (URS requirement, SOP-202, team sheet, Mural) | Editor |
| `powerbi/power_query_blob.m` | Generated Power Query: reference tables, current observations, one typed column per field (ratings included), defect incidence, plan progress, media coverage, audit | Power BI Desktop |
| `docs/SOP_ALIGNMENT.md` | How SOP-00000202, the spreadsheets and the Mural map onto the catalog; the rating suggestion rules | Editor |
| `docs/README.md` | How the pieces fit, how to run locally, how to deploy, how to change a field | Editor |
| `docs/REQUIREMENTS_TRACEABILITY.md` | R-01 to R-38 status, open items, One-Pager deviations, and the 19-item September refresh | Editor |
| `docs/ARCHITECTURE_DECISIONS.md` | The eleven decisions that shape the build and why (including: no LIMS integration, SOP rating kept and derived) | Editor |
| `docs/reference_data_sync.md` | How the NESTMS export reaches the `reference` container; how to load spreadsheet history | Editor |
| `stability_tool_source.zip` | Full source: React app, Express API with tests, reference and history importers, schema generator with the refresh script, Bicep and deploy script, report builder | Unzip; `npm install` in `frontend/` and `backend/api/` |
