// R&D Stability Data Collection Tool: Azure infrastructure. Azure Blob Storage is the only data store.
// Deploy:  az deployment group create -g rg-nhsc-rd-stability-dev -f main.bicep -p env=dev entraTenantId=<tenant> entraApiAudience=api://stability-capture-api-dev
targetScope = 'resourceGroup'

@description('Environment suffix: dev | tst | prd')
param env string = 'dev'
@description('Azure region')
param location string = resourceGroup().location
@description('Short prefix for resource names (3-8 chars, lowercase)')
param prefix string = 'sdct'
@description('Existing Azure Web App name')
param webAppName string = 'nsus-dv-sfdfdev-adi-281-app'
@description('Existing storage account name')
param storageAccountName string = 'namsdvsrmcoreuseasta'
@description('Entra tenant id used to validate API tokens')
param entraTenantId string
@description('Application ID URI of the API app registration')
param entraApiAudience string
@description('Allowed browser origin(s) for CORS, comma separated')
param allowedOrigins string = ''

// The storage account already exists. Container setup and RBAC are handled by
// deploy.sh for this existing-resource deployment.

// ------------------------------------------------------------------ Observability
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${prefix}-${env}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 90 }
}
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${prefix}-${env}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

// ------------------------------------------------------------------ Existing Web App (React build + Express API in one Node app)
resource web 'Microsoft.Web/sites@2023-12-01' existing = {
  name: webAppName
}

resource webAppSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: web
  name: 'appsettings'
  properties: {
    PORT: '8080'
    LOCAL_MODE: 'false'
    STATIC_DIR: '/home/site/wwwroot/frontend/dist'
    ALLOWED_ORIGINS: empty(allowedOrigins) ? 'https://${webAppName}.azurewebsites.net' : allowedOrigins
    ENTRA_TENANT_ID: entraTenantId
    ENTRA_API_AUDIENCE: entraApiAudience
    STORAGE_ACCOUNT_NAME: storageAccountName
    CONTAINER_REFERENCE: 'reference'
    CONTAINER_OBSERVATIONS: 'observations'
    CONTAINER_MEDIA: 'media'
    CONTAINER_CURATED: 'curated'
    CONTAINER_CONFIG: 'config'
    SAS_UPLOAD_MINUTES: '15'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
  }
}

output webAppUrl string = 'https://${web.properties.defaultHostName}'
output storageAccountName string = storageAccountName
output blobEndpoint string = 'https://${storageAccountName}.blob.${environment().suffixes.storage}/'
output webAppPrincipalId string = web.identity.principalId
