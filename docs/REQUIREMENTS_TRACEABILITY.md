# Requirements traceability: URS V2 (31 March 2026) against this build

Status key: **Met** (implemented and exercised in the demo or the API tests), **Met, pending confirmation** (implemented on an assumption that PD needs to confirm), **Partial**, **Deferred** (scoped out of Phase 1 by the URS or One-Pager).

| Req | Requirement (short) | Status | Where |
|---|---|---|---|
| R-01 | Replace shared Excel with a governed tool | Met | Whole solution; Excel export retained for continuity (Review → Export CSV) |
| R-02 | Test context: project, AR, trial, variant, sample, time point, condition, observer, timestamp, result | Met | `TEST_CONTEXT` domain (22 fields), header fields on `OBS.OBSERVATION`; Capture screen context bar |
| R-03 | Trial / AR / Variant / Time point / Temperature / User / Sample referenced read-only from the system of record | Met, pending confirmation (OI-3) | `reference/` container (NESTMS export as JSON, `reference_bundle.schema.json`), API `reference.js`, read-only rows in the questionnaire, Admin → Reference data |
| R-04 | Six storage conditions (25°C, 4°C, 35°C, 45°C, 55°C, freezer) | Met | `TEMP_CONDITION` vocabulary (plus 30°C tropical per the SOP); conditions per AR come from the plan record in `reference/plans.json` |
| R-05 | Duration up to 18 months; 1/3/6/9/12 month intervals plus monthly and bi-weekly schemes | Met | `TIME_POINT` vocabulary (T0, 1D, 1W, 2W, 1M, 2M, 3M, 4M, 6M, 9M, 12M, 15M, 18M); plan grid and due dates |
| R-06 | Standardised schema replacing free text | Met | 195-field catalog (113 URS, 66 SOP-derived, 16 extension), 46 controlled vocabularies, free text is supplementary only (`*_comments`) |
| R-07 | Homogeneity descriptors | Met | 10 fields, unshaken/shaken flow with photos |
| R-08 | Creaming descriptors | Met | SOP rating (unshaken, shaken) suggested from the ring thickness, layer measurable → thickness + unit, SOP description words, colour, marbling, spots, pour exit time, surface %, photo, shake-in, residual and residue type, rim residue (not creaming), pour-out video and result, emulsifier flags |
| R-09 | Serum descriptors | Met | SOP rating (unshaken, shaken) suggested from % of package volume, measurable → value + unit + %, locations, clarity, colour, photo, shake-in, gelation and protein flags, scale-up warning, optional re-separation check after the consumer usage period |
| R-10 | Sediment descriptors with Protein / Mineral / Cocoa sub-types | Met | SOP rating (unshaken, shaken) suggested from height, coverage and bottle geometry; height in mm or cm, coverage, texture, measurement point and location, weight, bottle coating, shaken height and shake-in extent, clumps after shaking; Protein / Mineral / Cocoa sub-flows on `sed_predominant_type` |
| R-11 | Gelling, Non-homogeneity, Protein sagging | Met | In the MVP template since the September refresh: the team sheets show soft gel, rippling and lumping at most elevated pulls. Gel state, too thick to pour, reversibility, spoilage relation; rippling, lumps and their context, sieve, smooth after shaking; vertical stripes |
| R-12 | MVP priority: Homogeneity, Creaming, Serum, Sediment (Protein) | Met, extended | `TPL_RTD_MVP` (SOP guided questionnaire) leads with these four and adds gelling, non-homogeneity and protein sagging as short sections; `TPL_RTD_QUICK` is the six-rating spreadsheet as a form |
| R-13 | Explicit N/A instead of 9999; structured descriptors | Met | N/A pill with reasons including "gelled or too thick to pour" (what 9999 meant in the sheets); API rejects any literal 9999; the historical importer converts 9999 to N/A |
| R-14 | Controlled vocabularies maintained without code | Met | Admin → Vocabularies (add, retire, reactivate) writes `config/vocabularies.json`, audited |
| R-15 | Enforce hierarchy Project → AR → Trial (→ Variant → Sample) | Met | Cascading read-only selects; API `contextExists()` check against `reference/` before any write; parent/child integrity check at import. Lab results (pH, viscosity, Brix, D50) are typed in with instrument, geometry, shear rate and temperature; **there is no LIMS integration** |
| R-16 | Conditional / branching questionnaire | Met | `depends_on_field` / `depends_on_value` in the catalog; `branching.js`; 143 conditional rules in the JSON Schema |
| R-17 | Photo and video capture from the device camera | Met | `MediaCapture` uses `<input capture="environment">`; full-bottle and emptied-bottle photos mandatory per pull, beaker photo and pour videos optional |
| R-18 | Required-field validation before submission | Met | `validation.js` (required, N/A logic, ranges, 9999); server-side repeat in `store.js` |
| R-19 | Guided, fast entry | Met | Enter/Tab advances to the next visible field; short vocabularies render as tap chips; section rail with completion counts |
| R-20 | Templates per formulation class | Met | 5 seed templates (RTD MVP, RTD full, RTD quick, Powder draft, VMS draft), filtered by the trial's formulation class |
| R-21 | Reference data from the systems of record; lab results visible | Met | NESTMS reference data from `reference/`; lab results typed into the observation (no LIMS integration, per direction) and shown in Review and the reports |
| R-22 | Media renamed to a standard convention and stored in Blob | Met, pending confirmation (OI-4) | `naming.js` (app and API), regex enforced on SAS grant and on submit; convention documented in report 4 |
| R-23 | Versioning and lineage | Met | `versionNo`; blob versioning on the container; `previousVersionUri`; per-AR index of current versions; amendment tested (v2 created) |
| R-24 | Data available to analytics within minutes | Met | Curated NDJSON appended at submit; Power BI reads the `curated/` folders directly with the generated Power Query |
| R-25 | Dashboards by project, product, trial, time interval | Met | Reports 1, 2, 5; filters on every report page |
| R-26 | Trend visualisation across time points and conditions | Met | Report 2 (thickness, serum %, incidence, heatmap, lab drift) |
| R-27 | Filtering, timeline and list views | Met | Review screen: timeline / table / rating matrix, 7 filters incl. defect present |
| R-28 | Export | Met | CSV export (long format, one row per field value) from the app and the API |
| R-29 | Azure AD (Entra ID) authentication | Met | MSAL in the SPA; JWKS-validated bearer tokens in the API; identity taken from the token, never from the payload (tested) |
| R-30 | RBAC: scientist, reviewer, admin | Met | Entra app roles → permissions map; enforced in UI and API (403 tested) |
| R-31 | Full audit trail | Met | Append-only `curated/audit_log` NDJSON; CREATE/UPDATE/REVIEW/REJECT/MEDIA_UPLOAD/CONFIG_CHANGE (templates, vocabularies, reference imports) with correlation ids |
| R-32 | Who changed what, when | Met | Admin → Audit trail; `AuditLog` Power Query |
| R-33 | Volumes: ~120k tests over 2 years, 127 elements, ~5 photos + 1 video per test | Met (design) | ~15M curated value rows (~5 GB NDJSON), ~700k media files; Blob lifecycle to cool/archive; Power BI on curated NDJSON, not raw documents |
| R-34 | 20 to 25 users, ~15 concurrent, < 3 s response | Met (design) | Stateless API, media goes device → Blob directly via SAS (not through the Web App); reference data cached 60 s in the API; lists read the per-AR index, never the document tree |
| R-35 | Transactional integrity, no partial records | Met | Media verified before write; create-only document write; compensating delete on failure (tested path) |
| R-36 | Resilience to connectivity loss | Met | Local drafts, submission queue flushed on `online`; offline pill in the top bar |
| R-37 | Data quality: no free-text where a vocabulary exists | Met | Vocabulary-typed fields; JSON Schema enums generated from `vocabularies.csv` |
| R-38 | Admin configuration without a developer (Could, OPEN) | Met | Template builder (search, add, reorder, sections, required overrides, CSV import, versioned publish); vocabulary management; reference data import; three custom observation slots |

## Open items from the URS

| Item | What was assumed here | What PD needs to confirm |
|---|---|---|
| OI-1 Domain scope for MVP | Homogeneity, Creaming, Serum, Sediment (Protein) in the default template; Gelling, Non-homogeneity, Protein sagging, Mineral and Cocoa sediment fully modelled and one click away | Confirm the MVP template contents with N. Ingalls |
| OI-2 Vocabulary confirmation | 46 vocabularies, 209 values, now aligned to the SOP tables and the words the team writes in its sheets (see `SOP_ALIGNMENT.md`) | Walk the value lists with two senior scientists; the Admin screen can absorb changes without a release |
| OI-3 NESTMS feasibility | Reference entities modelled with the Mural filter fields (I2L code, AR type, requestor, forecasted date, process scale, packaging clarity and geometry, pH target, hydrolysates); two load paths (Admin upload, scheduled CLI import); demo reference set until the first import | Confirm that NESTMS can export trial, AR, variant, sample and plan identifiers on a schedule (CSV or JSON). Kneil's field mapping lists Snowflake as the source; the export needs to land in the reference container instead |
| OI-4 Media naming spec | `{PROJECT}_{AR}_{TRIAL}_V{VARIANT}_{TP}_{COND}_{DOMAIN}_{FIELD}_{YYYYMMDD-HHMMSS}_{SEQ}.{ext}` | Confirm token order and whether a lab-specific prefix is required |
| OI-5 Admin configuration | Delivered as R-38 above | Decide who holds the admin role at Bridgewater |

## Deviations from the One-Pager V6 that need a decision

1. **Front end**: the One-Pager names Power Apps and lists "React/AngularJS UI" as out of scope. The scoping call redirected the DXC team to a React front end on an Azure Web App, and that is what was built. The Power Platform Developer line ($40/hr) becomes a React developer line; cost is unchanged if the same DXC resources are used.
2. **Data store**: the One-Pager names Azure SQL and the URS architecture names Snowflake. Per your direction the tool is linked to Azure Blob Storage only: versioned JSON documents for the record, append-only NDJSON for analytics, JSON reference data, and Power BI reading Blob directly. No database or warehouse is provisioned. The Azure SQL and Snowflake cost lines drop out of the One-Pager; the storage account is the only data cost.
3. **Out of scope in Phase 1 and still out of scope here**: AI or computer vision on the photos, SAP correlation, GxP validation. Media files are already named and pathed so a later vision model can be pointed at the `media` container without re-landing anything.

## September 2026 refresh: SOP, team sheets and Mural (all 19 items approved)

| # | Change | Where |
|---|---|---|
| 1 | SOP 0 to 5 ratings for creaming, serum, sediment, unshaken and shaken, suggested from the measurement | `*_rating` fields, `lib/ratings.js`, suggestion chip in Capture |
| 2 | Shaken sediment height and shaken ratings above the sediment-type branch | `sed_sh_*` at domain level |
| 3 | Sediment coverage, texture, measurement point and location, weight, bottle coating, cm support | `sed_unsh_*`, `UNIT_LENGTH` |
| 4 | SOP creaming words, pour exit time, shaken residue type, rim residue not creaming | `CREAM_LAYER_DESC`, `cream_*` |
| 5 | Gelling, rippling, lumping and protein sagging in the MVP template | `TPL_RTD_MVP`, `gel_too_thick_to_pour`, `nh_*` |
| 6 | Lab results as measurements with instrument, geometry, shear rate, temperature | `lab_visc1_*`, `lab_visc2_*` |
| 7 | Lab results typed in (no LIMS integration, per direction) | `lab_source`, `lab_lims_reference`, `lab_measured_at`; reference `labResults` entity removed |
| 8 | Time points 1D, 1W, 4M, 15M and the 30°C condition | `TIME_POINT`, `TEMP_CONDITION`, offsets everywhere |
| 9 | N/A reasons: gelled or too thick to pour, not evaluated, opaque bottle, study discontinued | `FieldRow` |
| 10 | In / Just In / Out | `OVERALL_RESULT`, app, reports |
| 11 | Sensory and color (optional) | `APPEARANCE_SENSORY` domain |
| 12 | Serum re-separation check (optional) | `serum_resep_*`, `project.consumerUsagePeriodHours` |
| 13 | Three custom observation slots | `CUSTOM` domain |
| 14 | Reference attributes from the Mural and the sheets | `reference_bundle.schema.json`, import CLI, Capture side panel |
| 15 | Trial codes keep their structure in media filenames | `naming.js` (dot to hyphen) |
| 16 | Mandatory full-bottle and emptied-bottle photos, optional beaker photo and pour video | `GENERAL_MEDIA`, `nh_pour_video` |
| 17 | Shaking protocol at the header; exclude from trend with reason | `shake_protocol`, `shake_count`, `exclude_from_trend`, curated header `excludeFromTrend` |
| 18 | Rating matrix view and rating trend charts | Review, report 2 |
| 19 | Historical spreadsheet import | `backend/api/tools/import_history.mjs` (rehearsed on the Benefic sheet: 183 rows, 0 invalid) |
