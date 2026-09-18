#!/usr/bin/env bash
# One-shot deployment of the stack (one Web App + one Storage account). Requires: az cli (logged in), node 20, npm.
set -euo pipefail
ENV="${1:-dev}"; RG="${RG:-nsus-dv-sfdf-usea-rgp}"; LOC="${LOC:-eastus}"
WEB_APP_NAME="${WEB_APP_NAME:-nsus-dv-sfdfdev-adi-281-app}"
STORAGE_RESOURCE_GROUP="${STORAGE_RESOURCE_GROUP:-nams-dv-srm-usea-rgp}"
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-namsdvsrmcoreuseasta}"
TENANT_ID="$(az account show --query tenantId -o tsv)"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== 1/6 Entra app registration (API) with app roles"
API_APP_ID=$(az ad app list --display-name "Stability Capture API ($ENV)" --query "[0].appId" -o tsv)
if [ -z "$API_APP_ID" ]; then
  API_APP_ID=$(az ad app create --display-name "Stability Capture API ($ENV)" --sign-in-audience AzureADMyOrg --app-roles @"$ROOT/backend/infra/entra-app-roles.json" --query appId -o tsv)
  az ad app update --id "$API_APP_ID" --identifier-uris "api://stability-capture-api-$ENV"
  az ad sp create --id "$API_APP_ID" >/dev/null
fi
SPA_APP_ID=$(az ad app list --display-name "Stability Capture SPA ($ENV)" --query "[0].appId" -o tsv)
if [ -z "$SPA_APP_ID" ]; then
  SPA_APP_ID=$(az ad app create --display-name "Stability Capture SPA ($ENV)" --sign-in-audience AzureADMyOrg --query appId -o tsv)
fi
echo "API app: $API_APP_ID   SPA app: $SPA_APP_ID"
echo "   -> In the portal: expose scope 'access_as_user' on the API app, grant it to the SPA app, add the SPA redirect URI after step 2, assign users to app roles."

echo "== 2/6 Resource group + Bicep"
az group create -n "$RG" -l "$LOC" -o none
az webapp identity assign -g "$RG" -n "$WEB_APP_NAME" -o none
WEB="https://$(az webapp show -g "$RG" -n "$WEB_APP_NAME" --query defaultHostName -o tsv)"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-$WEB}"
WEB_PRINCIPAL_ID="$(az webapp identity show -g "$RG" -n "$WEB_APP_NAME" --query principalId -o tsv)"
STORAGE_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$STORAGE_RESOURCE_GROUP/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT_NAME"

echo "   Existing Web App: $WEB_APP_NAME in $RG"
echo "   Existing Storage: $STORAGE_ACCOUNT_NAME in $STORAGE_RESOURCE_GROUP"
for c in reference observations media curated config; do
  az storage container create --account-name "$STORAGE_ACCOUNT_NAME" -n "$c" --auth-mode login -o none
done
az role assignment create --assignee "$WEB_PRINCIPAL_ID" --role "Storage Blob Data Contributor" --scope "$STORAGE_SCOPE" -o none 2>/dev/null || true
az role assignment create --assignee "$WEB_PRINCIPAL_ID" --role "Storage Blob Delegator" --scope "$STORAGE_SCOPE" -o none 2>/dev/null || true
az storage account blob-service-properties update --account-name "$STORAGE_ACCOUNT_NAME" --resource-group "$STORAGE_RESOURCE_GROUP" --enable-versioning true --enable-change-feed true --change-feed-retention-days 365 --enable-delete-retention true --delete-retention-days 30 --enable-container-delete-retention true --container-delete-retention-days 30 -o none
az storage cors clear --account-name "$STORAGE_ACCOUNT_NAME" --services b --auth-mode login -o none 2>/dev/null || true
az storage cors add --account-name "$STORAGE_ACCOUNT_NAME" --services b --methods PUT GET HEAD OPTIONS --origins "$ALLOWED_ORIGINS" --allowed-headers "*" --exposed-headers "*" --max-age 3600 --auth-mode login -o none 2>/dev/null || true

az deployment group create -g "$RG" -f "$ROOT/backend/infra/main.bicep" \
  -p env="$ENV" location="$LOC" webAppName="$WEB_APP_NAME" storageAccountName="$STORAGE_ACCOUNT_NAME" entraTenantId="$TENANT_ID" entraApiAudience="api://stability-capture-api-$ENV" allowedOrigins="$ALLOWED_ORIGINS" -o none
APP_NAME="$WEB_APP_NAME"
echo "Web app: $WEB"

echo "== 3/6 Build the React app for this environment"
cat > "$ROOT/frontend/.env.production" <<ENVEOF
VITE_API_BASE=
VITE_AUTH_MODE=msal
VITE_ENTRA_CLIENT_ID=$SPA_APP_ID
VITE_ENTRA_TENANT_ID=$TENANT_ID
VITE_API_SCOPE=api://stability-capture-api-$ENV/access_as_user
ENVEOF
(cd "$ROOT/frontend" && npm ci && npm run build)

echo "== 4/6 Package and deploy (frontend/dist + backend/api)"
TMP=$(mktemp -d); mkdir -p "$TMP/frontend" "$TMP/backend"
cp -r "$ROOT/frontend/dist" "$TMP/frontend/dist"; cp -r "$ROOT/backend/api" "$TMP/backend/api"; rm -rf "$TMP/backend/api/node_modules"
cat > "$TMP/package.json" <<'PKG'
{ "name": "stability-capture-webapp", "private": true, "scripts": { "start": "npm start --prefix backend/api", "postinstall": "npm ci --omit=dev --omit=optional --prefix backend/api" } }
PKG
(cd "$TMP" && zip -qr deploy.zip .)
az webapp config set -g "$RG" -n "$APP_NAME" --linux-fx-version "NODE|20-lts" --startup-file "npm start --prefix backend/api" --ftps-state Disabled --min-tls-version 1.2 --http20-enabled true -o none
az webapp deploy -g "$RG" -n "$APP_NAME" --src-path "$TMP/deploy.zip" --type zip -o none

echo "== 5/6 Register the SPA redirect URI"
az ad app update --id "$SPA_APP_ID" --set spa.redirectUris="[\"$WEB\"]" 2>/dev/null || az ad app update --id "$SPA_APP_ID" --web-redirect-uris "$WEB"

echo "== 6/6 Done. Next: load reference data (Admin > Reference data, or: cd backend/api && STORAGE_ACCOUNT_NAME=<account> npm run import-reference -- --csv-dir <nestms-export>) and assign users to app roles."
echo "Health: $WEB/api/health"
