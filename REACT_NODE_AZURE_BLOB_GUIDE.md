# React + Node.js Azure Blob Storage Build Guide

This guide explains how to build and deploy the Stability Capture application as a React frontend with a Node.js Express API, using Azure Blob Storage as the only data store for questionnaire templates, submitted questionnaire data, media, curated reporting data, and reference data.

The system uses:

- React + Vite frontend
- Node.js Express API
- Azure Web App for hosting
- Azure Blob Storage for persistence
- Microsoft Entra ID for authentication and app roles
- Managed identity and Azure RBAC for secure storage access
- Power BI reading curated Blob datasets

## 1. Target Architecture

```text
React + Vite frontend
        |
        | HTTPS API calls
        v
Node.js Express API on Azure Web App
        |
        | Managed identity / Azure RBAC
        v
Azure Blob Storage
```

Blob Storage is the only data store. There is no SQL database, Snowflake integration, or LIMS integration in this application.

## 2. Azure Blob Containers

The application uses one storage account with five runtime containers.

| Container | Purpose |
|---|---|
| `reference` | Master/reference data from NESTMS exports, such as projects, ARs, trials, variants, samples, plans, and users |
| `observations` | Submitted questionnaire/observation JSON documents and per-AR indexes |
| `media` | Photos and videos uploaded directly from the device |
| `curated` | Append-only NDJSON datasets used by Power BI |
| `config` | Versioned questionnaire templates and live vocabularies |

Runtime paths:

```text
reference/projects.json
reference/ars.json
reference/trials.json
reference/variants.json
reference/samples.json
reference/plans.json
reference/users.json
reference/_manifest.json

observations/{PROJECT}/{AR}/{TRIAL}/{observationId}.json
observations/_index/{AR}.json

media/{PROJECT}/{AR}/{TRIAL}/{standard-file-name}

curated/observation_header/yyyy/mm/dd.ndjson
curated/observation_value/yyyy/mm/dd.ndjson
curated/media_asset/yyyy/mm/dd.ndjson
curated/audit_log/yyyy/mm/dd.ndjson

config/templates/{templateId}/v{n}.json
config/vocabularies.json
```

## 3. Questionnaire Data Storage Model

Questionnaire templates are stored in the `config` container:

```text
config/templates/{templateId}/v{n}.json
config/vocabularies.json
```

Submitted questionnaire data is stored as complete JSON documents in the `observations` container:

```text
observations/{PROJECT}/{AR}/{TRIAL}/{observationId}.json
```

Each observation document contains:

- project, AR, trial, variant, sample, condition, and time point
- `templateId`
- `templateVersion`
- observer identity
- questionnaire values
- explicit N/A values and N/A reasons
- media references
- status and review information
- `versionNo`
- audit metadata

The API also writes flattened reporting rows into the `curated` container so Power BI can read stable analytics datasets without parsing full observation documents.

## 4. Database Concept Mapping

| Database concept | Blob Storage equivalent |
|---|---|
| Reference tables | `reference/*.json` |
| Questionnaire/observation transaction table | `observations/**/*.json` |
| Questionnaire answer/value table | `values[]` inside observation JSON plus `curated/observation_value` |
| Media asset table | `media/**` plus `curated/media_asset` |
| Audit log | `curated/audit_log` |
| Questionnaire templates | `config/templates/**` |
| Views for reporting | Generated Power Query in `powerbi/power_query_blob.m` |
| Primary key / uniqueness | Create-only blob writes and ETag guarded index updates |
| Foreign keys | API checks against `reference/` before writing |
| Transactions | Ordered writes plus compensating delete on failure |

## 5. Prerequisites

Install these tools on the machine used for local development and deployment:

```bash
node >= 22
npm
az
zip
unzip
python3
```

Sign in to Azure:

```bash
az login
az account set -s <subscription-id-or-name>
```

On Windows, run the Bash scripts from Git Bash, WSL, or Azure Cloud Shell.

## 6. Required Azure Permissions

The deploying identity needs:

1. Permission to create a resource group and deploy resources in the target subscription.
2. Permission to create role assignments at the storage account scope. Owner or User Access Administrator is typically required.
3. Permission to create Microsoft Entra application registrations.
4. Storage Blob Data Contributor on the target storage account when uploading the delivery bundle with `AUTH_MODE=login`.

## 7. Check the Bundle

From the repository root, run:

```bash
./install.sh check
```

This verifies required tools, bundle inventory, checksums, and effective configuration.

Expected runtime container configuration:

```text
CONTAINER_REFERENCE=reference
CONTAINER_OBSERVATIONS=observations
CONTAINER_MEDIA=media
CONTAINER_CURATED=curated
CONTAINER_CONFIG=config
```

## 8. Prove the Stack Locally

Before deploying to Azure, run the local smoke test:

```bash
./install.sh test
```

This unpacks `stability_tool_source.zip` into `work/sdct/`, installs dependencies, and runs the Express API smoke test in `LOCAL_MODE`.

The smoke test verifies:

- reference cascade
- SAS grant flow
- media naming enforcement
- rejected submit before media upload
- JSON schema validation
- rejection of `9999` placeholder values
- server-side identity enforcement
- amendment versioning
- role checks
- template validation
- vocabulary updates
- reference import validation
- audit trail
- CSV export

## 9. Run the App Locally

Run:

```bash
./install.sh local
```

Start the API:

```bash
cd work/sdct/backend/api
npm run dev
```

The API runs at:

```text
http://localhost:8080
```

Start the React frontend in another terminal:

```bash
cd work/sdct/frontend
cp .env.example .env
```

Set this value in `.env`:

```text
VITE_API_BASE=http://localhost:8080
```

Then run:

```bash
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

## 10. Questionnaire Capture Flow

The React application should follow this business flow:

1. User signs in.
2. User selects Project, AR, Trial, Variant, Sample, Condition, and Time Point from reference data.
3. App loads the active questionnaire template from the API.
4. App renders questionnaire fields in template order.
5. User enters measurements and observations.
6. User marks explicit N/A values where applicable.
7. User captures mandatory media, such as before-pour and after-pour photos.
8. App requests upload SAS URLs from the API.
9. Device uploads media directly to the `media` container.
10. App submits the observation JSON to the API.
11. API validates the payload and writes to Blob Storage.
12. API appends curated NDJSON rows for reporting.
13. API writes an audit event.

## 11. Backend Validation Rules

The Node.js API must enforce these rules before writing questionnaire data:

- Validate the observation document against `blob_schema/observation.schema.json`.
- Reject `9999` placeholder values.
- Require explicit N/A reason when a field is marked N/A.
- Verify Project, AR, Trial, Variant, Sample, Condition, and Time Point against the `reference` container.
- Confirm every referenced media blob exists before committing the observation.
- Rewrite observer identity from the validated Entra token.
- Ignore any client-supplied observer or role claims.
- Enforce app roles for scientist, reviewer, and admin actions.
- Write initial observation documents as create-only.
- Use blob versioning and `versionNo` for amendments.
- Append audit records for submit, review, config, and import events.

## 12. Direct-to-Blob Media Upload

Photos and videos should not pass through the Node.js API.

Use this flow:

1. React app computes the standard media filename.
2. React app asks the API for a SAS URL for that exact path.
3. API validates the requested path and filename convention.
4. API creates a short-lived, write-only user delegation SAS.
5. Browser uploads the file directly to the `media` container.
6. React app includes the media path in the observation submit payload.
7. API checks the blob exists before writing the observation document.

Standard media filename pattern:

```text
{PROJECT}_{AR}_{TRIAL}_V{VARIANT}_{TP}_{COND}_{DOMAIN}_{FIELD}_{YYYYMMDD-HHMMSS}_{SEQ}.{ext}
```

Blob path pattern:

```text
media/{PROJECT}/{AR}/{TRIAL}/{standard-file-name}
```

## 13. Deploy to Azure

Deploy a development environment:

```bash
./install.sh azure dev
```

This runs the local checks and then deploys the Azure stack.

Deployment creates:

- resource group
- storage account
- five runtime Blob containers
- lifecycle policy for media
- Log Analytics workspace
- Application Insights
- App Service plan
- Azure Web App
- system-assigned managed identity
- storage role assignments
- Entra API app registration
- Entra SPA app registration
- React production build
- Node.js API deployment package

Default resource group pattern:

```text
rg-nhsc-rd-stability-<environment>
```

Default environment values:

```text
dev
tst
prd
```

Deploy test and production environments with:

```bash
./install.sh azure tst
./install.sh azure prd
```

### GitHub Actions deployment

The GitHub Actions workflow is located at:

```text
.github/workflows/azure-webapp.yml
```

The workflow must run `npm` commands from the nested package folders, not the repository root:

```text
sdct/backend/api
sdct/frontend
```

The workflow uses `azure/login@v2` before `azure/webapps-deploy@v3`. Without this login step, deployment fails with:

```text
Error: Deployment Failed, Error: No credentials found. Add an Azure login action before this action.
```

Create these GitHub repository secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
VITE_ENTRA_CLIENT_ID
VITE_ENTRA_TENANT_ID
```

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` are used by `azure/login@v2` for CI deployment. `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID` are used when building the React app with MSAL settings.

## 14. Existing Resource Groups, Web App, and Storage Account

If you already have a resource group and App Service for the Web App, and a different resource group for the storage account, update the deployment details in these places.

### Root bundle configuration

The top-level `install.sh` file controls the wrapper commands.

Update this block near the top of `install.sh`:

```bash
ENVIRONMENT="${ENVIRONMENT:-dev}"
RESOURCE_GROUP="${RESOURCE_GROUP:-nsus-dv-sfdf-usea-rgp}"
LOCATION="${LOCATION:-eastus}"
WEB_APP_NAME="${WEB_APP_NAME:-nsus-dv-sfdfdev-adi-281-app}"
STORAGE_RESOURCE_GROUP="${STORAGE_RESOURCE_GROUP:-nams-dv-srm-usea-rgp}"
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-namsdvsrmcoreuseasta}"
DELIVERY_CONTAINER="${DELIVERY_CONTAINER:-delivery}"
DELIVERY_PREFIX="${DELIVERY_PREFIX:-stability-capture/v3}"
```

Use `RESOURCE_GROUP` for the Web App deployment resource group:

```bash
RESOURCE_GROUP=<existing-webapp-resource-group> LOCATION=<region> ./install.sh azure dev
```

Use `WEB_APP_NAME` for the existing Azure Web App name.

Use `STORAGE_RESOURCE_GROUP` for the storage account resource group.

Use `STORAGE_ACCOUNT_NAME` when uploading the delivery bundle to an existing storage account:

```bash
STORAGE_ACCOUNT_NAME=<existing-storage-account-name> DELIVERY_CONTAINER=<container> DELIVERY_PREFIX=<folder> ./install.sh upload
```

### Unpacked source deployment files

The real Azure deployment files are inside `stability_tool_source.zip`. They appear after running:

```bash
./install.sh test
```

or from the already-unpacked `sdct/` folder in this workspace.

Then check these files:

```text
sdct/backend/infra/deploy.sh
sdct/backend/infra/main.bicep
```

Use `deploy.sh` for deployment command behavior, packaging, app registration, and `az webapp deploy` logic.

Use `main.bicep` for existing Web App app settings, App Insights, Log Analytics, and outputs. Existing storage account container setup and RBAC are handled by `deploy.sh` because the storage account is in a separate resource group.

### Existing Web App values

The deployment scripts are configured with these existing Web App values:

```text
Web App resource group: nsus-dv-sfdf-usea-rgp
Web App name: nsus-dv-sfdfdev-adi-281-app
Location: eastus
```

`sdct/backend/infra/deploy.sh` deploys the package to this existing Web App with:

```bash
az webapp deploy -g "$RG" -n "$APP_NAME" --src-path "$TMP/deploy.zip" --type zip -o none
```

You will also need to make sure the existing Web App has these app settings configured:

```text
STORAGE_ACCOUNT_NAME=namsdvsrmcoreuseasta
CONTAINER_REFERENCE=reference
CONTAINER_OBSERVATIONS=observations
CONTAINER_MEDIA=media
CONTAINER_CURATED=curated
CONTAINER_CONFIG=config
ENTRA_TENANT_ID=<tenant-id>
ENTRA_API_AUDIENCE=<api-audience>
APPLICATIONINSIGHTS_CONNECTION_STRING=<app-insights-connection-string>
```

### Existing storage account values

The deployment scripts are configured with these existing storage values:

```text
Storage account resource group: nams-dv-srm-usea-rgp
Storage account name: namsdvsrmcoreuseasta
```

`sdct/backend/infra/deploy.sh` creates or verifies the required containers, enables blob service settings, configures CORS, and assigns the Web App managed identity the required roles on this storage account.

Required roles on the existing storage account:

```text
Storage Blob Data Contributor
Storage Blob Delegator
```

The existing storage account must also contain these runtime containers:

```text
reference
observations
media
curated
config
```

### Recommended values to document before deployment

Capture these values before changing deployment scripts:

```text
Web App resource group: nsus-dv-sfdf-usea-rgp
Web App name: nsus-dv-sfdfdev-adi-281-app
Storage account resource group: nams-dv-srm-usea-rgp
Storage account name: namsdvsrmcoreuseasta
Location: eastus
Tenant ID: <tenant-id>
Subscription ID: <subscription-id>
```

## 15. Azure Security Guidance

Use managed identity and Azure RBAC. Do not use storage account keys for the application.

The Web App managed identity needs these roles:

| Role | Purpose |
|---|---|
| Storage Blob Data Contributor | Read/write observation, config, reference, curated, and media blobs |
| Storage Blob Delegator | Create user delegation SAS URLs for direct media upload |

Recommended storage account settings:

- HTTPS only
- TLS 1.2 minimum
- shared key access disabled
- blob versioning enabled
- 30-day blob soft delete enabled
- 30-day container soft delete enabled
- change feed enabled
- CORS configured for the React app origin
- LRS for dev/test
- GRS for production

## 16. Required Manual Entra Step

After deployment, complete this step in Microsoft Entra ID:

1. Open the API app registration.
2. Expose the `access_as_user` scope.
3. Grant that scope to the SPA app registration.
4. Grant admin consent.

Without this step, user sign-in can succeed but API calls may fail with `401`.

## 17. Assign Users to App Roles

In Microsoft Entra ID:

```text
Enterprise applications
  Stability Capture API (<environment>)
    Users and groups
      Add user/group assignment
```

Assign users or groups to one of these roles:

- `Stability.Scientist`
- `Stability.Reviewer`
- `Stability.Admin`

Role behavior:

- Scientist can capture and submit observations.
- Reviewer can review observations.
- Admin can manage reference data, templates, vocabularies, audit, and roles.

## 18. Upload the Delivery Bundle

After Azure deployment, upload the delivery bundle:

```bash
./install.sh upload
```

This uploads documentation, mockups, reports, schemas, Power Query, and source ZIP into the configured delivery container.

Default delivery path:

```text
delivery/stability-capture/v3/
```

This delivery container is separate from the runtime data containers.

To upload somewhere else:

```bash
STORAGE_ACCOUNT_NAME=<account> DELIVERY_CONTAINER=docs DELIVERY_PREFIX=stability ./install.sh upload
```

To make HTML reports and the mockup browsable by public static website URL, enable static website hosting and upload to `$web`:

```bash
DELIVERY_CONTAINER='$web' DELIVERY_PREFIX= ./install.sh upload
```

## 19. Load Reference Data

Until real reference data is loaded, the API serves bundled demo reference data and marks it as `DEMO_SEED`.

Reference data can be loaded in two ways.

Admin screen:

```text
Reference data -> Import bundle -> Upload JSON bundle
```

Scheduled CLI import:

```bash
cd work/sdct/backend/api
STORAGE_ACCOUNT_NAME=<account> npm run import-reference -- --csv-dir <nestms-export-folder>
```

Dry run validation:

```bash
STORAGE_ACCOUNT_NAME=<account> npm run import-reference -- --csv-dir <nestms-export-folder> --dry-run
```

The import validates:

- JSON schema shape
- required fields
- parent-child integrity
- orphan sample rejection
- known condition codes
- known time point codes

The manifest is written last so a partial import is never visible.

## 20. Connect Power BI

Power BI reads directly from the `curated` and `reference` containers.

Steps:

1. Open Power BI Desktop.
2. Select Get data.
3. Choose Blank query.
4. Open Advanced editor.
5. Paste the contents of `powerbi/power_query_blob.m`.
6. Set the storage account name parameter.
7. Authenticate with an organizational account.

The Power BI identity needs Storage Blob Data Reader on:

- `curated`
- `reference`

Generated Power BI datasets include:

- reference tables
- current observations
- one typed column per questionnaire field
- defect incidence
- plan progress
- media coverage
- audit log

## 21. Verification Checklist

Run this checklist after every deployment:

1. `https://<webapp>/api/health` returns healthy.
2. User can sign in.
3. Persona switcher is not visible in real Azure mode.
4. User role controls visible actions.
5. Scientist captures a questionnaire observation end to end.
6. Mandatory media files land in the `media` container.
7. Observation JSON lands in the `observations` container.
8. Curated rows land in the `curated` container.
9. Reviewer can review the observation.
10. Scientist cannot review the observation.
11. Power BI refresh shows the new observation.
12. Application Insights shows API requests.
13. Delivery bundle is reachable at the uploaded `INDEX.md` path.

## 22. Change a Questionnaire Field, Vocabulary, or Template

The field catalog is the source of truth.

Edit:

```text
work/sdct/backend/schema/field_catalog.csv
work/sdct/backend/schema/vocabularies.csv
```

Then regenerate schema outputs:

```bash
cd work/sdct
python3 backend/schema/generate_schema.py
```

This regenerates:

- JSON schemas
- curated dataset definitions
- Blob layout documentation
- Power Query layer
- frontend catalog JSON

Template versioning rule:

```text
config/templates/{templateId}/v1.json
config/templates/{templateId}/v2.json
config/templates/{templateId}/v3.json
```

Existing observations keep the template version they were captured with.

## 23. Rollback and Teardown

Rollback the Web App by redeploying the previous zip package with `az webapp deploy`.

Observation data does not need a traditional database rollback because:

- observation documents are create-only on first write
- amendments are versioned
- Blob versioning keeps previous versions
- curated datasets are append-only
- containers have soft delete enabled

To tear down an environment:

```bash
az group delete -n rg-nhsc-rd-stability-<env>
az ad app delete --id <api-app-id>
az ad app delete --id <spa-app-id>
```

## 24. Troubleshooting

| Symptom | Likely fix |
|---|---|
| `403` on blob writes after deployment | Wait a few minutes for RBAC propagation, then retry |
| Upload cannot discover storage account | Deploy first or set `STORAGE_ACCOUNT_NAME` manually |
| `AUTH_MODE=key` fails against solution account | Expected because shared key access is disabled; use `AUTH_MODE=login` |
| SAS upload fails | Check Storage Blob Data Contributor and Storage Blob Delegator assignments |
| Browser blocks media upload | Check storage CORS for the Web App origin |
| Sign-in loops or blank page | Check SPA redirect URI and exposed API scope |
| API returns `401` | Check `ENTRA_API_AUDIENCE` and exposed `access_as_user` scope |
| API returns `403` | Check user app-role assignment |
| Web App deploy succeeds but site returns `503` | Tail Web App logs and wait for postinstall dependency restore |
| Runtime container verification fails | Check container name mismatch or RBAC propagation delay |
| Reference import rejected | Fix the entity and field named in the validation error |

## 25. Most Important Implementation Rule

The API should be the only writer to these containers:

- `observations`
- `curated`
- `config`
- `reference`

The browser should upload only media files, and only with a short-lived SAS scoped to one exact blob path.

This keeps questionnaire data validated, versioned, auditable, and protected from client-side tampering.