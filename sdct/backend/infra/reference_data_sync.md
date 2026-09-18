# Reference data: how NESTMS data reaches the tool

The tool never lets a scientist type a project, AR, trial, variant, sample, time point or storage condition. Those come from the `reference` container, which holds one JSON array per entity plus `_manifest.json` (counts, source, timestamp, who loaded it). Lab results (pH, viscosity, Brix, D50) are typed into the questionnaire by the scientist with instrument, shear rate and temperature; there is no LIMS integration.

## Two ways to load it

1. **Admin screen → Reference data → Import bundle (JSON)**. For the PoV: export from NESTMS, shape it to `reference_bundle.schema.json`, upload. Validated field by field and for parent/child integrity (an AR must belong to a listed project, a sample to a listed variant, and so on). Written entity by entity with the manifest last, so a half-finished import is never visible. Audited as `CONFIG_CHANGE / REFERENCE`.
2. **Scheduled**: `cd backend/api && npm run import-reference -- --csv-dir <folder>` (or `--bundle file.json`) from a pipeline step or a scheduled job that has the *Storage Blob Data Contributor* role on the `reference` container (Bicep parameter `referenceImporterObjectId`). CSV columns match the JSON property names; in `plans.csv` the `conditions` and `timePoints` columns are pipe-separated. `--dry-run` validates without writing.

The API caches reference data for 60 seconds, so a new export is live within a minute with no restart. Until the first import the API serves the bundled demo set and flags it as `DEMO_SEED` in `/api/reference/status` and in the Admin screen.

## What each entity needs

| Entity | Key | Required columns |
|---|---|---|
| projects | projectCode | projectCode, projectName, status, formulationClass (+ i2lCode, consumerUsagePeriodHours) |
| ars | arNumber | arNumber, projectCode, arTitle, status (+ arType, requestedBy, forecastedDate) |
| trials | arNumber + trialNumber | trialNumber, arNumber, formulationClass (+ processScale, status, terminationReason) |
| variants | variantId | variantId, trialNumber, arNumber, variantNumber (+ phTarget, containsHydrolysates) |
| samples | sampleCode | sampleCode, variantId, conditionCode (4C, 25C, 30C, 35C, 45C, 55C, FRZ) (+ bottleClarity, bottleBaseGeometry, packagingDescription, sourceFactory) |
| plans | planId + planVersion | planId, planVersion, arNumber, intervalScheme, durationMonths, planStatus, conditions, timePoints, validFrom |
| users | userId | userId, displayName, upn, role |

Codes for conditions and time points are enforced against the capture vocabulary, so a typo in an export is rejected before it can reach a scientist's screen.

## Spreadsheet history

`npm run import-history -- --xlsx <file> --sheet <name> --layout benefic --project <code> --ar <AR>` turns the team's stability sheets into observation documents (SOP ratings, sediment heights, pH and viscosity, comments; 9999 becomes N/A) and writes a reference fragment for the trials, variants and samples it found. Load the fragment first, then rerun with `--write`. Rehearsed on the Benefic sheet: 183 rows, 0 invalid.
