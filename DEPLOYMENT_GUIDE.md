# Deployment Guide: R&D Stability Data Collection Tool

Technical guide for standing up the Stability Capture stack in Azure, installing this bundle into the storage account, and verifying everything. Written for the engineers doing the deployment. The business context, requirements traceability and architecture rationale live in `docs/`; this document only covers getting the system running.

The whole stack is one Azure Web App (React front end + Express API in a single Node 22 app) and one Storage account. Azure Blob Storage is the only data store. There is no database, no Snowflake link, and no LIMS integration.

## 1. What gets deployed

`backend/infra/main.bicep` creates everything except the Entra app registrations, which `deploy.sh` creates first:

| Component | Name pattern | Notes |
|---|---|---|
| Storage account | `st{prefix}{env}{6-char hash}` | StorageV2, TLS 1.2 minimum, HTTPS only, shared key access disabled (managed identity and user delegation SAS only), LRS in dev/tst, GRS in prd |
| Blob containers | `reference`, `observations`, `media`, `curated`, `config` | Blob versioning on, 30-day soft delete on blobs and containers, change feed retained 365 days, CORS for PUT/GET/HEAD/OPTIONS from the app origin |
| Lifecycle policy | `media-tiering` | `media/` blobs cool after 90 days, archive after 3 years; everything else stays hot |
| Log Analytics + App Insights | `log-{prefix}-{env}`, `appi-{prefix}-{env}` | 90-day retention, workspace-based App Insights wired into the Web App |
| App Service plan | `asp-{prefix}-{env}` | Linux, B1 by default (enough for the 3-month PoV), P1v3 recommended for 20 to 25 users with media uploads |
| Web App | `app-{prefix}-{env}-{6-char hash}` | Node 22 LTS, system-assigned managed identity, HTTPS only, `npm start --prefix backend/api`, all app settings preconfigured including the storage account name |
| Role assignments | on the storage account and containers | Web App identity: Storage Blob Data Contributor + Storage Blob Delegator (to mint user delegation SAS for device uploads). Optional: reference importer identity gets Contributor on `reference` only; Power BI identity gets Reader on `curated` and `reference` only |
| Entra app registrations | `Stability Capture API ({env})`, `Stability Capture SPA ({env})` | Created by `deploy.sh`, not Bicep. The API app carries the three app roles from `entra-app-roles.json`: Stability.Scientist, Stability.Reviewer, Stability.Admin |

Default prefix is `sdct`. The 6-character hash comes from `uniqueString(resourceGroup().id)`, so names are stable per resource group.

## 2. Prerequisites

Tools on the machine running the deployment:

```
node >= 22, npm          the API and the Web App run on Node 22
az (Azure CLI), logged in with: az login
zip, unzip               deploy.sh packages the Web App as a zip
python3                  only for regenerating schema outputs when the catalog changes
```

Azure permissions for the deploying identity:

1. Rights to create a resource group and run deployments in the target subscription (Contributor is enough for the resources themselves).
2. Rights to create role assignments at the storage account scope, because the Bicep assigns data-plane roles. In practice this means Owner or User Access Administrator on the resource group, or a custom role with `Microsoft.Authorization/roleAssignments/write`.
3. Rights to create Entra application registrations (Application Developer role or better in the tenant).
4. For installing the bundle into a storage account (`./install.sh upload` with the default `AUTH_MODE=login`): Storage Blob Data Contributor on that account.

Run `./install.sh check` from the bundle root to confirm the tooling and print the effective configuration before starting.

## 3. Configuration

Every install-time value lives in one marked block at the top of `install.sh`. Edit it there once, or override any value per call as an environment variable:

```
STORAGE_ACCOUNT_NAME=stnhscdelivery DELIVERY_CONTAINER=docs ./install.sh upload
```

| Variable | Default | What it controls |
|---|---|---|
| `ENVIRONMENT` | `dev` | dev, tst or prd; drives the resource group default and the `azure` command |
| `RESOURCE_GROUP` | `rg-nhsc-rd-stability-<ENVIRONMENT>` | Where the stack is deployed, and where the storage account is discovered from when `STORAGE_ACCOUNT_NAME` is left empty |
| `LOCATION` | `eastus2` | Azure region for new deployments |
| `STORAGE_ACCOUNT_NAME` | empty | The account the bundle is installed into. Empty means the script discovers it from the deployed stack in `RESOURCE_GROUP`; set it explicitly to install into any other account |
| `DELIVERY_CONTAINER` | `delivery` | The container the bundle lands in. Use `'$web'` (quoted) to publish to the static website endpoint |
| `DELIVERY_PREFIX` | `stability-capture/v3` | Virtual folder inside the container; empty means the container root |
| `AUTH_MODE` | `login` | `login` uses Entra RBAC; `key` uses the account key. The solution's own account has shared key access disabled, so `key` only works against other accounts |
| `OVERWRITE` | `true` | Replace blobs that already exist at the destination |
| `CONTAINER_REFERENCE` .. `CONTAINER_CONFIG` | `reference`, `observations`, `media`, `curated`, `config` | The solution's runtime container names. The authoritative definition is `var containers` in `main.bicep` plus the Web App app settings; these variables must mirror it. The `azure` command verifies each one exists after deployment, so a rename that only happened in one place is caught immediately |

`./install.sh check` prints the effective configuration so what is about to be used is always visible.

## 4. Bundle layout

```
Files_Azure_Blob_Storage_V3/
  install.sh                    entry point (check | upload | test | local | azure [env] | clean); configuration block at the top
  DEPLOYMENT_GUIDE.md           this document
  INDEX.md                      what every file is
  Stability_Capture_Mockup.html the app in demo mode, one file, no backend
  stability_tool_source.zip     full source: frontend, API with tests, schema generator, Bicep, deploy.sh
  reports/                      five sample Power BI style reports from the seeded data
  blob_schema/                  the data contract: JSON Schemas, field catalog, vocabularies, Blob layout
  powerbi/power_query_blob.m    generated Power Query for the reporting layer
  docs/                         README, SOP alignment, traceability, architecture decisions, reference sync
```

`install.sh` unpacks the source into `work/sdct/` and leaves the rest of the bundle untouched; `work/` is never uploaded.

## 5. Prove the stack locally first

Before touching Azure, run the end-to-end smoke test. It needs no tenant and no storage account: LOCAL_MODE keeps everything in memory.

```
./install.sh test
```

This unpacks the source, installs dependencies for the API and the front end, and runs `backend/api/test/smoke.test.mjs`. The test walks the full business flow: reference cascade, SAS grant with naming enforcement, rejected submit before media upload, schema validation including the 9999 placeholder rejection, server-side identity, amendment versioning, role checks (scientist cannot review or import reference data), template validation, vocabulary change, reference import with orphan rejection, audit trail, CSV export. If this passes, the code you are about to deploy works.

For a local development loop, `./install.sh local` prints the two dev commands (API on :8080, React on :5173).

## 6. Deploy the stack to Azure

```
./install.sh azure dev
```

This runs the check and smoke test, then hands off to `backend/infra/deploy.sh dev` with the resource group and region from the configuration block. What that script does, in order:

1. **Entra app registrations.** Creates `Stability Capture API (dev)` with the three app roles and the identifier URI `api://stability-capture-api-dev`, plus `Stability Capture SPA (dev)`. Idempotent: existing registrations with those display names are reused.
2. **Resource group and Bicep.** Creates the resource group and deploys `main.bicep` with the tenant id and API audience. Prints the Web App URL from the deployment output.
3. **Front end build.** Writes `frontend/.env.production` with the SPA client id, tenant id and API scope, then `npm install --no-audit --no-fund && npm run build`.
4. **Package and deploy.** Zips `frontend/dist` and `backend/api` (without node_modules) into one Node Web App with a root `package.json` whose postinstall restores API dependencies on the App Service, then `az webapp deploy`.
5. **SPA redirect URI.** Registers the Web App URL as the SPA redirect URI.
6. **Prints the health URL** and the next steps.

After deploy.sh finishes, install.sh verifies that each runtime container from the configuration block exists in the new account, then points you at the upload command.

Bicep parameters worth knowing (`az deployment group create ... -p name=value`, or edit the deploy.sh call):

| Parameter | Default | When to change |
|---|---|---|
| `planSku` | `B1` | `P1v3` for tst/prd with real users and media uploads |
| `allowedOrigins` | the Web App's own origin | Only if the front end is hosted on a different origin |
| `referenceImporterObjectId` | empty | Object id of the pipeline service principal that runs the scheduled reference import |
| `powerBiReaderObjectId` | empty | Object id of the Power BI service principal or AD group that reads `curated` and `reference` |

### One manual Entra step

The CLI cannot do everything. In the portal, on the API app registration: expose the `access_as_user` scope, grant it to the SPA app registration, and give admin consent. `deploy.sh` prints a reminder. Without it, sign-in succeeds but API calls fail with 401.

## 7. Install the bundle into the storage account

```
./install.sh upload
```

With the defaults, this discovers the storage account from the deployed stack in `RESOURCE_GROUP`, creates `DELIVERY_CONTAINER` if it does not exist, and uploads the whole bundle (mockup, reports, schemas, Power Query, docs, source zip, checksums) under `DELIVERY_PREFIX`, excluding the local `work/` copy. The command prints the resulting blob path for `INDEX.md` when it finishes.

To install into any other account, a different container, or a different folder, change the variables at the top of `install.sh` or override them on the call:

```
STORAGE_ACCOUNT_NAME=stnhscdelivery DELIVERY_CONTAINER=docs DELIVERY_PREFIX=stability ./install.sh upload
```

Two practical notes. First, `AUTH_MODE=login` needs Storage Blob Data Contributor on the target account, and on a freshly deployed account that role assignment can take a few minutes to propagate; if the first upload returns 403, wait and retry. Second, blobs in a private container do not open directly in a browser. To make the mockup and the HTML reports browsable by link, enable the storage account's static website feature and publish there: `DELIVERY_CONTAINER='$web' DELIVERY_PREFIX= ./install.sh upload`. Otherwise the team opens the files through the portal, Storage Explorer, or a download.

## 8. Assign users to app roles

Access is entirely app-role driven; there is no role data in storage. In Entra: Enterprise applications, `Stability Capture API (dev)`, Users and groups, add each user or group to Stability.Scientist, Stability.Reviewer or Stability.Admin. The API rewrites the observer identity from the token, so nothing a client claims about itself is trusted.

## 9. Load reference data

Until the first import, the API serves the bundled demo set and flags it as `DEMO_SEED` in `/api/reference/status` and on the Admin screen. Two ways to load the real NESTMS export, both detailed in `docs/reference_data_sync.md`:

1. **Admin screen.** Reference data, Import bundle (JSON). The bundle is validated against `blob_schema/reference_bundle.schema.json` field by field and for parent-child integrity before anything is written; the manifest is written last so a half-finished import is never visible.
2. **Scheduled.** From a pipeline identity that holds Storage Blob Data Contributor on the `reference` container (the `referenceImporterObjectId` parameter):

```
cd work/sdct/backend/api
STORAGE_ACCOUNT_NAME=<account> npm run import-reference -- --csv-dir <nestms-export-folder>
```

`--dry-run` validates without writing. The API caches reference data for 60 seconds, so a new export is live within a minute with no restart.

To backfill the team's historical spreadsheets, `npm run import-history` converts them into observation documents (9999 becomes N/A); see the last section of `docs/reference_data_sync.md`.

## 10. Connect Power BI

Open Power BI Desktop, Get data, Blank query, Advanced editor, paste `powerbi/power_query_blob.m`, and set the storage account name parameter at the top. Authenticate with an organizational account that has Storage Blob Data Reader on the `curated` and `reference` containers (the `powerBiReaderObjectId` parameter grants exactly that to a service principal or group for the service refresh). The generated queries expose the reference tables, current observations, one typed column per catalog field, defect incidence, plan progress, media coverage and the audit log.

## 11. Verification checklist

Run through this after every environment deployment:

1. `https://<webapp>/api/health` returns healthy.
2. Sign in to the app; the persona switcher is gone and your app role decides what you see.
3. Capture an observation end to end on AR data: pick context, fill a template, take the two mandatory photos, submit.
4. In the storage account: the media files landed under `media/{PROJECT}/{AR}/{TRIAL}/` with standard names, the document under `observations/{PROJECT}/{AR}/{TRIAL}/`, and new NDJSON rows under `curated/`.
5. As a reviewer, review the observation; as a scientist, confirm the review action is not offered.
6. Refresh the Power BI queries; the new observation appears in `Observation_Current`.
7. App Insights shows the requests.
8. The bundle is reachable in the delivery container at the path `upload` printed.

## 12. Environment promotion

Same script, different argument: `./install.sh azure tst`, then `./install.sh azure prd` (the resource group default follows the environment automatically unless `RESOURCE_GROUP` is set). Each environment gets its own resource group, storage account, Web App and pair of Entra app registrations, so nothing is shared. Differences to apply for prd: `planSku=P1v3`, storage is already GRS by the `env` switch in Bicep, tighten `networkAcls` to private endpoints (the Bicep marks the spot), and set `allowedOrigins` if a custom domain fronts the app. Run `./install.sh upload` per environment if each account should carry its own copy of the bundle.

## 13. Changing a field, vocabulary or template

The catalog is the source of truth. Edit `backend/schema/field_catalog.csv` or `vocabularies.csv`, then:

```
python3 backend/schema/generate_schema.py
```

One run regenerates the JSON Schemas, the curated dataset definitions, `BLOB_LAYOUT.md`, the Power Query layer and the app's `catalog.json` together, so the questionnaire, the stored records and the reports cannot drift apart. Redeploy with `./install.sh azure <env>` (the smoke test runs again on the way). Vocabulary values can also be added at runtime on the Admin screen, which writes `config/vocabularies.json`. Templates are versioned in `config/templates/{id}/v{n}.json`; observations keep the template version they were captured with.

## 14. Rollback and teardown

The Web App deploys as a zip, so rolling back is redeploying the previous zip with `az webapp deploy`. Data needs no rollback machinery: observation documents are create-only with blob versioning, curated datasets are append-only, and every container has 30-day soft delete. To tear an environment down completely:

```
az group delete -n rg-nhsc-rd-stability-<env>
az ad app delete --id <api-app-id>
az ad app delete --id <spa-app-id>
```

## 15. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| 403 on blob writes or on `./install.sh upload` right after deployment | Data-plane role assignments can take a few minutes to propagate. Wait five minutes and retry before changing anything |
| `upload` cannot discover the storage account | No deployment named `main` in `RESOURCE_GROUP`. Set `STORAGE_ACCOUNT_NAME` explicitly at the top of install.sh, or deploy first |
| `upload` fails with `key` auth against the solution account | Expected: shared key access is disabled on that account by design. Use `AUTH_MODE=login`, or point at a different account |
| SAS upload from the device fails | The Web App identity needs both Storage Blob Data Contributor and Storage Blob Delegator on the account; check the two role assignments exist. Also check device clock skew, the SAS window is 15 minutes |
| Browser blocks the direct-to-Blob upload | CORS: the storage CORS rule must include the app origin. Set `allowedOrigins` if the front end is not on the default Web App origin |
| Sign-in loops or lands on a blank page | SPA redirect URI missing or wrong (step 5 of deploy.sh), or the `access_as_user` scope was never exposed and granted (section 6, manual step) |
| API returns 401 with a valid login | `ENTRA_API_AUDIENCE` must match the API app's identifier URI exactly, `api://stability-capture-api-<env>` |
| API returns 403 for an action the user should have | The user is not assigned to the app role on the API enterprise application, or has the wrong role. Roles come only from the token |
| `az webapp deploy` succeeds but the site 503s | Watch the log stream: `az webapp log tail -g <rg> -n <app>`. The postinstall step restores API dependencies on first start and takes a minute on B1 |
| Runtime container verification flags NOT FOUND | Either a rename happened in `main.bicep` without updating the configuration block (or the reverse), or data-plane RBAC is still propagating. Align the names, or retry in a few minutes |
| Reference import rejected | That is the validation doing its job: the message names the entity and field. Orphans (a sample pointing at an unknown variant) and unknown condition or time point codes are rejected before anything is written |
| Deployment output lookup fails in deploy.sh | The script reads the deployment named `main`; if you renamed the Bicep file, pass `-n main` or adjust the `az deployment group show` call |
