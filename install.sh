#!/usr/bin/env bash
# R&D Stability Data Collection Tool: bundle install script.
# Installs this bundle into an Azure storage account (upload), proves the
# stack locally (test), and deploys the full solution (azure).
set -euo pipefail

# ============================================================================
# CONFIGURATION
# Edit the values here before running, or override any of them per call as an
# environment variable, e.g.:
#   STORAGE_ACCOUNT_NAME=stnhscdelivery DELIVERY_CONTAINER=docs ./install.sh upload
# ============================================================================

# ---- Environment and Azure scope --------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"                                  # dev | tst | prd
RESOURCE_GROUP="${RESOURCE_GROUP:-nsus-dv-sfdf-usea-rgp}"           # Web App resource group
LOCATION="${LOCATION:-eastus}"                                     # Azure region for new deployments
WEB_APP_NAME="${WEB_APP_NAME:-nsus-dv-sfdfdev-adi-281-app}"         # Existing Azure Web App name

# ---- Bundle install target (the upload command) ------------------------------
STORAGE_RESOURCE_GROUP="${STORAGE_RESOURCE_GROUP:-nams-dv-srm-usea-rgp}" # Existing storage account resource group
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-namsdvsrmcoreuseasta}" # Existing storage account name
DELIVERY_CONTAINER="${DELIVERY_CONTAINER:-delivery}"               # container the bundle lands in; use '$web' for the static website endpoint
DELIVERY_PREFIX="${DELIVERY_PREFIX:-stability-capture/v3}"         # virtual folder inside the container; empty = container root
AUTH_MODE="${AUTH_MODE:-login}"                                    # login = Entra RBAC (needs Storage Blob Data Contributor); key = account key (the solution account has shared key access disabled, so key only works on other accounts)
OVERWRITE="${OVERWRITE:-true}"                                     # true = replace blobs that already exist at the destination

# ---- Runtime containers of the solution --------------------------------------
# These names must mirror backend/infra/main.bicep (var containers) and the Web
# App app settings. Changing a name means changing it there too; the azure
# command verifies these exist after deployment and will flag a mismatch.
CONTAINER_REFERENCE="${CONTAINER_REFERENCE:-reference}"
CONTAINER_OBSERVATIONS="${CONTAINER_OBSERVATIONS:-observations}"
CONTAINER_MEDIA="${CONTAINER_MEDIA:-media}"
CONTAINER_CURATED="${CONTAINER_CURATED:-curated}"
CONTAINER_CONFIG="${CONTAINER_CONFIG:-config}"

# ============================================================================
# End of configuration. No changes needed below this line for a normal install.
# ============================================================================

[ -n "$RESOURCE_GROUP" ] || RESOURCE_GROUP="rg-nhsc-rd-stability-$ENVIRONMENT"

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$BUNDLE_DIR/work"
SRC_ZIP="$BUNDLE_DIR/stability_tool_source.zip"
SDCT="${SDCT:-$BUNDLE_DIR/sdct}"
[ -d "$SDCT" ] || SDCT="$WORK_DIR/sdct"
RUNTIME_CONTAINERS=("$CONTAINER_REFERENCE" "$CONTAINER_OBSERVATIONS" "$CONTAINER_MEDIA" "$CONTAINER_CURATED" "$CONTAINER_CONFIG")

log()  { printf '%s\n' "== $*"; }
fail() { printf '%s\n' "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./install.sh <command>
  check         Verify tools, bundle integrity, and show the effective configuration
  upload        Install this bundle into the Azure storage account (see CONFIGURATION at the top)
  test          Unpack the source, install dependencies, run the end-to-end API smoke test
  local         Everything in test, then print the local run commands
  azure [env]   Everything in test, then deploy the full stack (env defaults to ENVIRONMENT)
  clean         Remove the unpacked working copy (./work)
EOF
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not found on PATH. $2"
}

need_az_login() {
  need az "Install the Azure CLI and run: az login."
  az account show >/dev/null 2>&1 || fail "Not logged in. Run: az login (and az account set -s <subscription>)."
}

check_node_version() {
  need node "Install Node.js 20 LTS or newer."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || fail "Node.js 20 or newer is required (found $(node --version)). The API and the Web App both run on Node 20."
}

print_config() {
  log "Effective configuration (edit the block at the top of install.sh, or override per call)"
  printf '   environment=%s  web_app_resource_group=%s  web_app_name=%s  location=%s\n' "$ENVIRONMENT" "$RESOURCE_GROUP" "$WEB_APP_NAME" "$LOCATION"
  printf '   storage_resource_group=%s  storage_account=%s\n' "$STORAGE_RESOURCE_GROUP" "$STORAGE_ACCOUNT_NAME"
  printf '   upload target: account=%s  container=%s  prefix=%s  auth=%s  overwrite=%s\n' \
    "${STORAGE_ACCOUNT_NAME:-<discover from resource group>}" "$DELIVERY_CONTAINER" "${DELIVERY_PREFIX:-<container root>}" "$AUTH_MODE" "$OVERWRITE"
  printf '   runtime containers: %s\n' "${RUNTIME_CONTAINERS[*]}"
}

cmd_check() {
  log "Tools"
  check_node_version
  need npm "Ships with Node.js."
  need unzip "Install unzip."
  need zip "Install zip. deploy.sh packages the Web App with it."
  need python3 "Needed only for regenerating the schema outputs (backend/schema/generate_schema.py)."
  printf '   node %s / npm %s / python %s\n' "$(node --version)" "$(npm --version)" "$(python3 --version | cut -d' ' -f2)"
  if command -v az >/dev/null 2>&1; then
    printf '   az %s (upload and azure commands available)\n' "$(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo present)"
  else
    printf '   az not found (fine for check/test/local; required for: ./install.sh upload, ./install.sh azure)\n'
  fi

  print_config

  log "Bundle inventory"
  local missing=0 present=0
  for f in \
    INDEX.md Stability_Capture_Mockup.html stability_tool_source.zip DEPLOYMENT_GUIDE.md \
    reports/01_stability_program_overview.html reports/02_trial_trend_analysis.html \
    reports/03_stability_plan_compliance.html reports/04_observation_detail_media.html \
    reports/05_cross_project_benchmarking.html \
    blob_schema/BLOB_LAYOUT.md blob_schema/observation.schema.json blob_schema/template.schema.json \
    blob_schema/reference_bundle.schema.json blob_schema/curated_datasets.json \
    blob_schema/field_catalog.csv blob_schema/vocabularies.csv blob_schema/SCHEMA_SUMMARY.md \
    powerbi/power_query_blob.m \
    docs/README.md docs/SOP_ALIGNMENT.md docs/REQUIREMENTS_TRACEABILITY.md \
    docs/ARCHITECTURE_DECISIONS.md docs/reference_data_sync.md
  do
    if [ ! -f "$BUNDLE_DIR/$f" ]; then printf '   MISSING %s\n' "$f"; missing=1; else present=$((present+1)); fi
  done
  [ "$missing" -eq 0 ] && printf '   all %s bundle files present\n' "$present"

  if [ -f "$BUNDLE_DIR/SHA256SUMS.txt" ]; then
    log "Checksums"
    (cd "$BUNDLE_DIR" && sha256sum --quiet -c SHA256SUMS.txt) && printf '   all checksums match\n'
  fi
  [ "$missing" -eq 0 ] || fail "Bundle is incomplete. Re-download the delivery ZIP."
  log "Check passed"
}

resolve_storage_account() {
  if [ -z "$STORAGE_ACCOUNT_NAME" ]; then
    log "STORAGE_ACCOUNT_NAME is empty; discovering it from the deployed stack in $RESOURCE_GROUP"
    STORAGE_ACCOUNT_NAME="$(az deployment group show -g "$RESOURCE_GROUP" -n main \
      --query properties.outputs.storageAccountName.value -o tsv 2>/dev/null || true)"
    [ -n "$STORAGE_ACCOUNT_NAME" ] || fail "Could not discover a storage account from resource group '$RESOURCE_GROUP'. Set STORAGE_ACCOUNT_NAME at the top of install.sh (or as an environment variable), or deploy the stack first with: ./install.sh azure"
    printf '   discovered: %s\n' "$STORAGE_ACCOUNT_NAME"
  fi
}

cmd_upload() {
  need_az_login
  resolve_storage_account
  log "Installing the bundle into storage account '$STORAGE_ACCOUNT_NAME', container '$DELIVERY_CONTAINER', prefix '${DELIVERY_PREFIX:-}'"

  az storage container create --account-name "$STORAGE_ACCOUNT_NAME" \
    -n "$DELIVERY_CONTAINER" --auth-mode "$AUTH_MODE" -o none

  # Stage everything except the local working copy so work/ never gets uploaded.
  local stage
  stage="$(mktemp -d)"
  (cd "$BUNDLE_DIR" && find . -type f ! -path './work/*' -print0 | \
    while IFS= read -r -d '' f; do
      mkdir -p "$stage/$(dirname "$f")"
      cp -p "$f" "$stage/$f"
    done)

  local overwrite_flag=()
  [ "$OVERWRITE" = "true" ] && overwrite_flag=(--overwrite)
  az storage blob upload-batch --account-name "$STORAGE_ACCOUNT_NAME" \
    -d "$DELIVERY_CONTAINER" --destination-path "$DELIVERY_PREFIX" -s "$stage" \
    --auth-mode "$AUTH_MODE" "${overwrite_flag[@]}" -o none
  rm -rf "$stage"

  local base="https://$STORAGE_ACCOUNT_NAME.blob.core.windows.net/$DELIVERY_CONTAINER"
  [ -n "$DELIVERY_PREFIX" ] && base="$base/$DELIVERY_PREFIX"
  log "Bundle installed. Start at: $base/INDEX.md"
  log "Auth note: with AUTH_MODE=login the caller needs Storage Blob Data Contributor on the account; right after a fresh deployment that role can take a few minutes to propagate."
}

unpack_source() {
  [ -f "$SRC_ZIP" ] || fail "stability_tool_source.zip not found next to install.sh."
  if [ -d "$SDCT" ]; then
    log "Source already unpacked at work/sdct (run: ./install.sh clean, to start fresh)"
  else
    log "Unpacking stability_tool_source.zip to work/"
    mkdir -p "$WORK_DIR"
    unzip -q "$SRC_ZIP" -d "$WORK_DIR"
  fi
}

install_deps() {
  log "Installing API dependencies (backend/api)"
  (cd "$SDCT/backend/api" && npm install --no-audit --no-fund)
  log "Installing frontend dependencies (frontend)"
  (cd "$SDCT/frontend" && npm install --no-audit --no-fund)
}

run_smoke() {
  log "Running the API smoke test (LOCAL_MODE, in-memory, no Azure)"
  (cd "$SDCT/backend/api" && npm test)
  log "Smoke test passed: schema validation, media naming, SAS flow, versioning, roles, reference import, audit"
}

cmd_test() {
  cmd_check
  unpack_source
  install_deps
  run_smoke
}

cmd_local() {
  cmd_test
  log "Local run"
  cat <<EOF
   Terminal 1:  cd work/sdct/backend/api && npm run dev
                (API on http://localhost:8080 in LOCAL_MODE)
   Terminal 2:  cd work/sdct/frontend && cp .env.example .env
                Set VITE_API_BASE=http://localhost:8080 in .env, then: npm run dev
                (React on http://localhost:5173, proxying /api)
   No backend at all: open Stability_Capture_Mockup.html in a browser.
EOF
}

cmd_azure() {
  local env_arg="${1:-}"
  if [ -n "$env_arg" ]; then
    case "$env_arg" in dev|tst|prd) ;; *) fail "Usage: ./install.sh azure [dev|tst|prd]";; esac
    if [ "$env_arg" != "$ENVIRONMENT" ]; then
      ENVIRONMENT="$env_arg"
      RESOURCE_GROUP="rg-nhsc-rd-stability-$ENVIRONMENT"   # recompute the default for the new environment
    fi
  fi
  need_az_login
  cmd_test
  log "Deploying to Azure ($ENVIRONMENT) via backend/infra/deploy.sh"
  log "Subscription: $(az account show --query name -o tsv)   Resource group: $RESOURCE_GROUP   Region: $LOCATION"
  RG="$RESOURCE_GROUP" LOC="$LOCATION" WEB_APP_NAME="$WEB_APP_NAME" STORAGE_RESOURCE_GROUP="$STORAGE_RESOURCE_GROUP" STORAGE_ACCOUNT_NAME="$STORAGE_ACCOUNT_NAME" bash "$SDCT/backend/infra/deploy.sh" "$ENVIRONMENT"

  log "Verifying the runtime containers"
  local acct
  acct="$(az deployment group show -g "$RESOURCE_GROUP" -n main --query properties.outputs.storageAccountName.value -o tsv)"
  local c ok=1
  for c in "${RUNTIME_CONTAINERS[@]}"; do
    if [ "$(az storage container exists --account-name "$acct" -n "$c" --auth-mode login --query exists -o tsv 2>/dev/null)" = "true" ]; then
      printf '   %s: ok\n' "$c"
    else
      printf '   %s: NOT FOUND (name mismatch with main.bicep, or RBAC still propagating)\n' "$c"; ok=0
    fi
  done
  [ "$ok" -eq 1 ] || log "Container check reported gaps; if roles were just assigned, retry in a few minutes: az storage container list --account-name $acct --auth-mode login"

  log "Azure deployment finished. Install the bundle into the account with: ./install.sh upload"
  log "Then follow DEPLOYMENT_GUIDE.md sections 8 to 10: assign app roles, load reference data, connect Power BI."
}

cmd_clean() {
  rm -rf "$WORK_DIR"
  log "Removed work/"
}

case "${1:-}" in
  check)  cmd_check ;;
  upload) cmd_upload ;;
  test)   cmd_test ;;
  local)  cmd_local ;;
  azure)  shift; cmd_azure "${1:-}" ;;
  clean)  cmd_clean ;;
  *) usage ;;
esac
